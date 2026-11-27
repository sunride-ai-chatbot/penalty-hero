// The World-Cup tree of the cup against the computer: sixteen clubs on the two sides, converging on the final in the middle.
// What is drawn comes from slotView/matchView (src/core/bracket.js): a club that may not be shown yet is a question mark.
import {SIZE,ROUNDS,slotView,matchView,shownRounds,roundName,mineAt,opponentOf,matchesIn,winnerOf} from '../core/bracket.js';
import {clubCrest,esc} from './crest.js';
const W=900,H=880,HW=40;                    // the drawing's own units; the picture scales with the screen
/** where a slot of round r (0 = the clubs, 1..3 = the winners of the round before) sits: column 0..8, row y */
function place(r,i){const n=SIZE>>r,half=n/2;if(r>=4)return {x:W/2,y:H*.72};const left=i<half,k=left?i:i-half,N=half;return {x:((left?r:8-r)+.5)*(W/9),y:(k+.5)*(H/N),left}}
export function treeHtml(T,{clubById}){
  const my=T.my,cur=T.over?-1:T.round,nameOf=id=>{const c=clubById(id);return c?(c.short||c.name):'?'};
  const view=(r,i)=>slotView(T,r,i);
  let lines='';
  for(let r=0;r<ROUNDS;r++){for(let j=0;j<matchesIn(r);j++){const a=place(r,2*j),b=place(r,2*j+1),t=place(r+1,j);                // feeders 2j and 2j+1 of round r meet in slot j of round r+1
      const sx=a.left?1:-1,xa=a.x+sx*HW,xt=(r===3?W/2:t.x)-sx*HW,xm=(xa+xt)/2,ya=a.y,yb=b.y,yt=r===3?H/2:t.y;
      if(r===3){const fy=H/2;lines+=`<path d="M${a.x+HW} ${fy}H${W/2-50}M${b.x-HW} ${fy}H${W/2+50}" class="ln"/>`;break}
      const won=view(r+1,j).known&&winnerOf(T,r,j)===my&&(my===winnerOf(T,r-1,2*j)||my===winnerOf(T,r-1,2*j+1)||r===0);
      const mine=((T.meIdx>>r)>>1)===j&&view(r+1,T.meIdx>>(r+1)).known&&view(r+1,T.meIdx>>(r+1)).id===my;
      lines+=`<path d="M${xa} ${ya}H${xm}M${xa} ${yb}H${xm}M${xm} ${ya}V${yb}M${xm} ${yt}H${xt}" class="ln${mine?' mine':''}"/>`}}
  let nodes='';
  const node=(r,i)=>{const p=place(r,i),v=view(r,i),c=v.known?clubById(v.id):null,isMe=v.known&&v.id===my,{m,side}=mineAt(T,Math.min(r,3)),oppSlot=r<=3&&cur===r&&i===((T.meIdx>>r)^1)&&v.known;
    const cls=['tn',v.known?'on':'q',isMe?'me':'',oppSlot?'opp':'',isMe&&T.over&&T.out!==null&&r===T.out?'lost':''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" style="left:${(p.x/W*100).toFixed(2)}%;top:${(p.y/H*100).toFixed(2)}%" data-r="${r}" data-i="${i}" aria-label="${v.known&&c?esc(c.name):'קבוצה שעוד לא נחשפה'}">${v.known&&c?`<span class="tn-c">${clubCrest(c)}</span>`:'<span class="tn-q">?</span>'}</button>`};
  for(let r=0;r<4;r++)for(let i=0;i<(SIZE>>r);i++){if(r===3&&false)continue;nodes+=node(r,i)}
  const champ=T.over&&T.champion?clubById(T.champion):null;
  const centre=`<div class="tn-final" style="left:50%;top:${(H*.28/H*100).toFixed(1)}%"><b>גמר</b></div><div class="tn-cup" style="left:50%;top:${(H*.5/H*100).toFixed(1)}%" aria-hidden="true">🏆</div>${champ?`<button type="button" class="tn on me champ${T.champion===my?'':' other'}" style="left:50%;top:${(H*.72/H*100).toFixed(1)}%" data-r="4" data-i="0" aria-label="${esc(champ.name)}"><span class="tn-c">${clubCrest(champ)}</span></button>`:''}`;
  const tree=`<div class="tree" role="group" aria-label="עץ הטורניר"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${lines}</svg>${nodes}${centre}</div>`;
  let results='';
  for(const r of shownRounds(T)){const rows=[];for(let m=0;m<matchesIn(r);m++){const v=matchView(T,r,m);if(!v)continue;
      rows.push(`<div class="mres${v.mine?' mine':''}"><bdi class="${v.w===0?'w':''}">${esc(nameOf(v.a))}</bdi><b dir="ltr">${v.sa}:${v.sb}</b><bdi class="${v.w===1?'w':''}">${esc(nameOf(v.b))}</bdi></div>`)}
    if(rows.length)results+=`<div class="rround"><h3>${esc(roundName(r))}</h3>${rows.join('')}</div>`}
  return {tree,results,champion:champ?champ.name:null,nameOf}}
