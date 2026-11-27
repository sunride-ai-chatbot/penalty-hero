// The trophy cabinet: medals for what the player has done, and the balls and stadiums some of them open. The choice is kept on the phone.
import {BALLS,FIELDS,medalsOf,ownedOf,askOf,prizeName,freshMedals,ballById,parseLook,parseSeen} from '../core/rewards.js';
import {esc} from './crest.js';

const pent=(x,y,r,rot)=>Array.from({length:5},(_,i)=>{const a=rot+i*Math.PI*2/5;return `${(x+r*Math.sin(a)).toFixed(1)},${(y-r*Math.cos(a)).toFixed(1)}`}).join(' ');
/** a ball from above, in the colours of its skin: the same panels the 3D ball wears */
export function ballSvg(skin,id=''){const k=skin,uid='b'+id;let patches=`<polygon points="${pent(50,50,13,0)}" fill="${k.patch}" stroke="${k.line}" stroke-width="1.4"/>`,seams='';
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5,px=50+13*Math.sin(a),py=50-13*Math.cos(a),qx=50+30*Math.sin(a),qy=50-30*Math.cos(a);seams+=`<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${qx.toFixed(1)}" y2="${qy.toFixed(1)}" stroke="${k.line}" stroke-width="1.4"/>`;
    patches+=`<polygon points="${pent(50+43*Math.sin(a+.63),50-43*Math.cos(a+.63),12,a+.63+Math.PI)}" fill="${k.patch}" stroke="${k.line}" stroke-width="1.4"/>`}
  return `<svg viewBox="0 0 100 100" aria-hidden="true"${k.glow>0?` style="filter:drop-shadow(0 0 ${Math.round(4+k.glow*14)}px ${k.patch})"`:''}><defs><clipPath id="${uid}c"><circle cx="50" cy="50" r="46"/></clipPath><radialGradient id="${uid}s" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity="${(.42+k.metal*.3).toFixed(2)}"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient></defs>
    <g clip-path="url(#${uid}c)"><rect width="100" height="100" fill="${k.base}"/>${seams}${patches}<rect width="100" height="100" fill="url(#${uid}s)"/></g><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/></svg>`}
const fieldArt=f=>`<span class="cab-field-art" style="--sky:${f.swatch[0]};--glow:${f.swatch[1]}">${f.id==='rain'?'<i>🌧</i>':''}</span>`;

export function cabinetFeature(C){const {S,show,top,store,intro}=C;
  const own=()=>ownedOf(S.stats);
  S.look=parseLook(store.get('look'),own());S.seen=parseSeen(store.get('seen'));
  const saveLook=()=>store.set('look',JSON.stringify(S.look));
  /** after the stats were reset: a prize that is no longer open falls back */
  const refreshLook=()=>{S.look=parseLook(JSON.stringify(S.look),own());saveLook()};
  /** the medals earned since the player was last told about them; they count as told from now on */
  function fresh(){const f=freshMedals(S.stats,S.seen);if(f.length){S.seen=[...S.seen,...f.map(m=>m.id)];store.set('seen',JSON.stringify(S.seen))}return f}
  const lines=f=>f.slice(0,3).map(m=>`🏅 ${esc(m.title)}${m.opens?' · נפתח: '+esc(prizeName(m)):''}`).concat(f.length>3?[`ועוד ${f.length-3} מדליות בארון הגביעים`]:[]);
  const look=()=>({skin:ballById(S.look.ball).skin,field:S.look.field});

  function screen(tab='balls'){const o=own(),meds=medalsOf(S.stats),done=meds.filter(m=>m.done).length,prizes=BALLS.length+FIELDS.length-3,open=o.balls.size+o.fields.size-3;
    const item=(kind,x,art)=>{const has=(kind==='ball'?o.balls:o.fields).has(x.id),on=(kind==='ball'?S.look.ball:S.look.field)===x.id;
      return `<button type="button" class="cab-item${on?' on':''}${has?'':' lock'}" data-kind="${kind}" data-id="${x.id}" aria-pressed="${on}"><span class="cab-art">${art}</span><strong>${esc(x.name)}</strong><small>${on?'נבחר ✓':has?'לבחירה':'🔒 '+esc(askOf(kind,x.id))}</small></button>`};
    const body=tab==='balls'?`<div class="cab-grid">${BALLS.map(b=>item('ball',b,ballSvg(b.skin,b.id))).join('')}</div>`
      :tab==='fields'?`<div class="cab-grid">${FIELDS.map(f=>item('field',f,fieldArt(f))).join('')}</div><p class="note">״לפי הקבוצה״: לכל קבוצה הלילה שלה, כמו קודם.</p>`
      :`<div class="cab-medals">${meds.map(m=>`<div class="medal${m.done?' done':''}"><span class="mk" aria-hidden="true">${m.done?'🏅':'○'}</span><div><strong>${esc(m.title)}</strong>${m.opens?`<small>פרס: ${esc(prizeName(m))}</small>`:''}<i class="bar"><b style="width:${Math.round(m.pct*100)}%"></b></i></div><bdi class="cnt">${m.value}/${m.need}</bdi></div>`).join('')}</div>`;
    show('cabinet',top('ארון גביעים',true,`${done} מדליות מתוך ${meds.length} · ${open} פרסים מתוך ${prizes}`)+`<main class="body"><div class="tabs" role="tablist">${[['balls','כדורים'],['fields','אצטדיונים'],['medals','מדליות']].map(([k,l])=>`<button type="button" role="tab" class="chip${tab===k?' on':''}" data-tab="${k}" aria-selected="${tab===k}">${l}</button>`).join('')}</div>${body}</main>`,el=>{
      el.querySelector('[data-back]').onclick=intro;
      for(const b of el.querySelectorAll('[data-tab]'))b.onclick=()=>screen(b.dataset.tab);
      for(const b of el.querySelectorAll('.cab-item'))b.onclick=()=>{if(b.classList.contains('lock'))return C.toast('נפתח ב: '+(askOf(b.dataset.kind,b.dataset.id)||'—'));if(b.dataset.kind==='ball')S.look.ball=b.dataset.id;else S.look.field=b.dataset.id;saveLook();screen(tab)}})}
  /** the stats were wiped: the medals can be earned and announced again */
  const reset=()=>{S.seen=[];store.set('seen','[]');refreshLook()};
  return {screen,fresh,lines,look,refreshLook,reset}}
