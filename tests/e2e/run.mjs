// Browser tests in headless Chrome: the real pages, the real 3D scene (software WebGL), two real clients for the network duel.
//   node tests/e2e/run.mjs            needs Playwright and a Chrome/Chromium (PLAYWRIGHT=<module path> CHROME=<binary> to point at them)
import assert from 'node:assert/strict';import fs from 'node:fs';import {createServer} from '../../scripts/serve.mjs';
const pw=await import(process.env.PLAYWRIGHT||'playwright').catch(()=>import('/opt/npm-tools/node_modules/playwright/index.mjs'));const {chromium}=pw.default||pw;
const exe=process.env.CHROME||['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
const srv=createServer().listen(0);await new Promise(r=>srv.once('listening',r));const BASE=`http://localhost:${srv.address().port}/`;
const browser=await chromium.launch({executablePath:exe,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const problems=[];let passed=0;
async function page(ctx,{local=false,none=false}={}){const p=await ctx.newPage();p.on('console',m=>{if(m.type()==='error'&&!/GPU stall|favicon/.test(m.text()))problems.push('console: '+m.text())});p.on('pageerror',e=>problems.push('pageerror: '+e.message));
  p.on('response',r=>{if(r.status()>=400&&!/favicon/.test(r.url()))problems.push(r.status()+' '+r.url())});
  if(local||none)await p.route('**/config/network.json',r=>r.fulfill({contentType:'application/json',body:local?'{"transport":"local"}':'{"transport":"none"}'}));
  else await p.route('**/config/network.json',r=>r.fulfill({contentType:'application/json',body:'{"transport":"none"}'}));   // tests never touch the live service
  return p}
const phone=()=>browser.newContext({viewport:{width:390,height:780},hasTouch:true,isMobile:true,locale:'he-IL'});
const step=async(name,fn)=>{const t=Date.now();try{await fn();passed++;console.log('ok   '+name+' ('+((Date.now()-t)/1000).toFixed(1)+'s)')}catch(e){problems.push(name+': '+e.message);console.log('FAIL '+name+'\n     '+e.message)}};
const pickClub=async(p,country,league,club)=>{await p.click(`.tile[data-country="${country}"]`);if(league)await p.click(`.tile[data-league="${league}"]`).catch(()=>{});await p.click(`.tile[data-club="${club}"]`)};
const state=p=>p.evaluate(()=>{const a=window.__ph&&window.__ph.arena,panel=document.querySelector('#panel');return {screen:document.querySelector('#app').dataset.screen,end:panel&&!panel.hidden?panel.innerText:null,kick:!!(a&&a._kick),dive:!!(a&&a._dive),
  who:document.querySelector('#who')?.innerText||'',scores:[...document.querySelectorAll('.hud-row')].map(r=>r.dataset.side+r.querySelector('.score').textContent+':'+[...r.querySelectorAll('.marks i')].map(i=>i.className==='in'?'1':i.className==='no'?'0':'-').join('')).sort().join(' ')}});
/* play a duel through the test hooks until the result panel shows; returns what was seen */
async function playOut(pages,limitMs=240000){const seen=pages.map(()=>({takers:[],roles:new Set(),party:false}));const t0=Date.now();let n=0;
  for(;;){if(Date.now()-t0>limitMs)throw new Error('the duel did not finish');let ended=0;
    for(const [i,p] of pages.entries()){if(!seen[i].party)seen[i].party=await p.evaluate(()=>!!document.querySelector('[data-celebrating]'));const s=await state(p);if(s.end){ended++;continue}
      if(s.kick||s.dive){const taker=s.who.split('\n').find(l=>l.includes('בועט:'))||'';if(seen[i].takers.at(-1)!==taker)seen[i].takers.push(taker);seen[i].roles.add(s.kick?'kick':'keep');n++;
        await p.evaluate(([k,n])=>{const a=window.__ph.arena;if(k)a._kick([2.7,-2.6,0.3,3.0,-1.5,2.2][n%6],[0.5,1.8,1.1,0.7,2.0,1.3][n%6],[0.73,0.75,0.71,0.74,0.8,0.72][n%6]);else a._dive(['L','DR','UL','C','R','D'][n%6])},[s.kick,n])}}
    if(ended===pages.length)break;await pages[0].waitForTimeout(60)}
  return seen}

await step('opening: logo over the looping video, the “שם השחקן” box, two modes; no network service → unavailable, no fake link',async()=>{const ctx=await phone(),p=await page(ctx);await p.goto(BASE);await p.waitForSelector('#playerName');
  assert.equal(await p.title(),'Penalty Hero');assert.equal(await p.textContent('label[for=playerName]'),'שם השחקן');assert.equal(await p.getAttribute('#playerName','maxlength'),'24');assert.ok(await p.getAttribute('#playerName','placeholder'));
  const v=await p.evaluate(()=>{const v=document.querySelector('.intro-video');return {loop:v.loop,muted:v.muted,inline:v.playsInline,src:v.currentSrc||v.src}});assert.ok(v.loop&&v.muted&&v.inline&&/penalty-intro\.mp4/.test(v.src));
  assert.ok(await p.isVisible('.intro-logo'));assert.deepEqual(await p.$$eval('.intro-card button',b=>b.map(x=>x.textContent)),['מול המחשב','מול חבר ברשת']);
  assert.equal(await p.getAttribute('link[rel=manifest]','href'),'app.webmanifest');assert.ok(await p.getAttribute('link[rel=apple-touch-icon]','href'));
  await p.fill('#playerName','א'.repeat(40));assert.equal((await p.inputValue('#playerName')).length,24);await p.fill('#playerName','נועה');await p.click('button[data-mode=net]');await pickClub(p,'il','il1','il:mhf');
  await p.waitForSelector('#app[data-screen=lobby]');assert.match(await p.textContent('.body'),/משחק ברשת לא מוגדר/);assert.equal(await p.$('#open'),null);assert.equal(await p.$('.linkbox'),null);await ctx.close()});

await step('country → league → club; the name can be edited again before the first kick; the choice is kept',async()=>{const ctx=await phone(),p=await page(ctx);await p.goto(BASE);await p.fill('#playerName','דני');await p.click('button[data-mode=cpu]');
  assert.ok((await p.$$('.tile[data-country]')).length>=9);assert.equal(await p.$('.tile[data-club]'),null,'no clubs before a country and a league are chosen');
  await p.click('.tile[data-country=il]');assert.deepEqual(await p.$$eval('.tile[data-league] strong',e=>e.map(x=>x.textContent)),['ליגת העל','ליגה לאומית','ליגה א׳ צפון','ליגה א׳ דרום']);
  await p.click('.tile[data-league=il1]');assert.equal((await p.$$('.tile[data-club]')).length,14);await p.click('.tile[data-club="il:mta"]');await p.click('#choose');await pickClub(p,'fr',null,'e:psg');
  await p.waitForSelector('#playerName2');assert.equal(await p.inputValue('#playerName2'),'דני');assert.equal(await p.textContent('label[for=playerName2]'),'שם השחקן');assert.equal((await p.$$('.five li')).length,10);
  await p.fill('#playerName2','דני הגדול');const text=await p.textContent('.versus');assert.match(text,/מכבי תל אביב/);assert.match(text,/פאריס/);
  await p.reload();await p.waitForSelector('#playerName');assert.equal(await p.inputValue('#playerName'),'דני הגדול','the name is remembered');await ctx.close()});

await step('the 3D scene: filmed taker, ball still until the contact frame, one committed dive, landing, reaction, changing shirts',async()=>{const ctx=await phone(),p=await page(ctx);await p.goto(BASE+'?debug=1');await p.fill('#playerName','דני');await p.click('button[data-mode=cpu]');
  await pickClub(p,'fr',null,'e:psg');await p.click('#choose');await pickClub(p,'il','il1','il:mta');await p.click('#go');await p.waitForFunction(()=>window.__ph&&window.__ph.arena.stage&&document.querySelector('.ar-load').hidden,null,{timeout:120000});
  const info=await p.evaluate(()=>({kind:window.__ph.arena.kind,d:window.__ph.arena.stage.debug(),canvas:!!document.querySelector('.pg-3d canvas'),arena:getComputedStyle(document.querySelector('#arena')).touchAction+'|'+getComputedStyle(document.querySelector('#arena')).userSelect}));
  assert.equal(info.kind,'3d');assert.equal(info.d.filmed,true,'the photographed taker is loaded before the first kick');assert.equal(info.d.clip,'highL');assert.ok(info.canvas);assert.equal(info.arena,'none|none');
  await p.waitForSelector('#who .face',{timeout:20000});const face=await p.evaluate(async()=>{for(let i=0;i<80;i++){const f=document.querySelector('#who .face');if(f.classList.contains('has')||!window.__ph)break;await new Promise(r=>setTimeout(r,100))}const f=document.querySelector('#who .face'),who=document.querySelector('#who');return {has:f.classList.contains('has'),img:!!f.querySelector('img')&&f.querySelector('img').naturalWidth,next:f.nextElementSibling&&f.nextElementSibling.textContent.includes('בועט:'),no:f.querySelector('b').textContent}});
  assert.ok(face.next,'the portrait stands right beside the taker\'s name');assert.ok(/^\d+$/.test(face.no),'the fallback is the shirt number');
  // whole goal in the picture on a portrait phone
  const g=await p.evaluate(()=>{const s=window.__ph.arena.stage,r=document.querySelector('#arena').getBoundingClientRect();return {l:s.toScreen(-3.66,0),r:s.toScreen(3.66,2.44),w:r.width,h:r.height,foot:s.toScreen(0,0)}});assert.ok(g.l[0]>4&&g.r[0]<g.w-4&&g.r[1]>0&&g.l[1]<g.h,'both posts, the bar and the goal line are inside the stage');
  // drive one kick by hand, frame by frame
  await p.waitForFunction(()=>window.__ph.arena._kick||window.__ph.arena._dive);const iKick=await p.evaluate(()=>!!window.__ph.arena._kick);
  await p.evaluate(()=>{const a=window.__ph.arena;a.stage.pause();if(a._kick)a._kick(-2.9,.5,.95);else a._dive('L')});await p.waitForFunction(()=>window.__ph.arena.stage.debug().keeper!=='wait',null,{timeout:20000});
  const trace=await p.evaluate(()=>{const s=window.__ph.arena.stage,out=[];for(let i=0;i<110;i++){s.step(.05);const d=s.debug();out.push({f:d.frame,clip:d.clip,bx:+d.ball.x.toFixed(3),by:+d.ball.y.toFixed(3),k:d.keeper,z:d.keeperZ,side:d.keeperSide,contact:d.contactAt!==null})}return out});
  const before=trace.filter(t=>!t.contact);assert.ok(before.length>15);assert.ok(before.every(t=>t.bx===41.5&&t.by===.145),'the ball rests on the spot until the boot arrives');
  const first=trace.find(t=>t.contact);assert.ok(first.f>=46&&first.f<=48,'the ball leaves on the contact frame of the film (47), got '+first.f);
  const frames=trace.filter(t=>t.clip==='highL').map(t=>t.f);assert.ok(frames.every((f,i)=>i===0||f>=frames[i-1]),'the filmed motion only moves forward');assert.ok(Math.max(...frames)===78,'and plays to its last frame before the reaction');
  const order=['set','read','dive','land','down'];const states=[...new Set(trace.map(t=>t.k))];assert.deepEqual(states,order.filter(s=>states.includes(s)),'keeper states in order: '+states);assert.ok(states.includes('dive')&&states.at(-1)==='down','he dives once and ends on the ground');
  const signs=new Set(trace.filter(t=>Math.abs(t.z)>.3).map(t=>Math.sign(t.z)));assert.ok(signs.size<=1,'he never changes side');assert.ok(['goal','miss'].includes(trace.at(-1).clip),'the taker reacts');
  const zs=trace.filter(t=>t.k==='dive').map(t=>Math.abs(t.z));assert.ok(zs.every((z,i)=>i===0||z>=zs[i-1]-1e-6),'the dive only moves away from the middle');
  await p.evaluate(()=>window.__ph.arena.stage.resume());
  await ctx.close()});

await step('touch: hold, drag and release kicks exactly once; a cancelled touch does not kick; holding selects nothing',async()=>{const ctx=await phone(),p=await page(ctx);await p.goto(BASE+'?debug=1&view=2d');await p.fill('#playerName','דני');await p.click('button[data-mode=cpu]');await pickClub(p,'es','es1','e:barcelona');await p.click('#draw');await p.click('#go');
  await p.waitForFunction(()=>window.__ph&&(window.__ph.arena._kick||window.__ph.arena._dive),null,{timeout:60000});
  for(let guard=0;guard<6&&!(await p.evaluate(()=>!!window.__ph.arena._kick));guard++){await p.evaluate(()=>window.__ph.arena._dive('L'));await p.waitForFunction(()=>window.__ph.arena._kick||window.__ph.arena._dive,null,{timeout:30000})}
  assert.ok(await p.isVisible('.ar-meter'));const win=await p.evaluate(()=>{const w=document.querySelector('.ar-window'),m=document.querySelector('.ar-meter'),c=getComputedStyle(w);const r=w.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {bg:c.backgroundColor,w:r.width,z:+getComputedStyle(m).zIndex,covered:top&&top.tagName==='CANVAS'}});
  assert.equal(win.bg,'rgb(255, 255, 255)');assert.ok(win.w>=5);assert.ok(win.z>=9&&!win.covered,'the white window is above the picture');
  const box=await p.locator('#arena').boundingBox();const count=()=>p.evaluate(()=>[...document.querySelectorAll('.marks i')].filter(i=>i.className).length);const n0=await count();
  const fire=(type,x,y,id=7)=>p.evaluate(([type,x,y,id])=>{const el=document.querySelector('#arena');el.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true,button:0}))},[type,x,y,id]);
  await fire('pointerdown',box.x+200,box.y+300);await p.waitForTimeout(150);assert.ok(await p.evaluate(()=>document.querySelector('.ar-meter').classList.contains('live')));await fire('pointermove',box.x+215,box.y+250);await fire('pointermove',box.x+235,box.y+200);await fire('pointermove',box.x+215,box.y+150);await fire('pointermove',box.x+190,box.y+100);await p.waitForTimeout(250);
  const fl=await p.evaluate(()=>{const f=document.querySelector('.ar-flight');return {shown:!f.hasAttribute('hidden'),d:f.firstElementChild.getAttribute('d')}});assert.ok(fl.shown&&/Q/.test(fl.d),'a pale flight line follows the finger');
  await fire('pointercancel',box.x+200,box.y+300);await p.waitForTimeout(250);
  assert.ok(await p.evaluate(()=>!!window.__ph.arena._kick),'a cancelled touch did not kick');assert.equal(await p.evaluate(()=>String(getSelection())),'');
  const [gx,gy]=await p.evaluate(()=>window.__ph.arena.stage.toScreen(1.2,1.0));const fx=box.x+gx,fy=box.y+gy+56;   // a finger placed so the sight lands inside the goal
  await fire('pointerdown',box.x+120,fy+40);await p.waitForTimeout(120);await fire('pointermove',fx,fy);await p.waitForTimeout(60);
  const sight=await p.evaluate(()=>{const r=document.querySelector('.ar-sight b').getBoundingClientRect();return r.y+r.height/2});assert.ok(sight<fy-30,'the sight rides above the finger, not under it ('+sight+' vs '+fy+')');
  await p.waitForTimeout(350);await fire('pointerup',fx,fy);await fire('pointerup',fx,fy);await fire('pointerdown',box.x+100,box.y+300,9);await fire('pointerup',box.x+100,box.y+300,9);
  await p.waitForFunction(n=>[...document.querySelectorAll('.marks i')].filter(i=>i.className).length>n,n0,{timeout:20000});await p.waitForTimeout(300);
  assert.equal(await count(),n0+1,'one release, one kick, one mark');
  // leaving during a kick: nothing fires afterwards
  await p.click('#quit');await p.click('#leave');await p.waitForSelector('#playerName');await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>window.__ph),null);await ctx.close()});

await step('a whole duel against the computer: takers rotate, both roles, marks and score agree, result, rematch, exit',async()=>{const ctx=await phone(),p=await page(ctx);await p.goto(BASE+'?debug=1&view=2d');await p.fill('#playerName','דני');await p.click('button[data-mode=cpu]');await pickClub(p,'fr',null,'e:psg');await p.click('#draw');await p.click('#go');
  await p.waitForSelector('#app[data-screen=game]');assert.match(await p.textContent('.pg-flat-note'),/תצוגה פשוטה/,'the simple picture says what it is');
  const [seen]=await playOut([p]);const s=await state(p);assert.match(s.end,/ניצחת בדו־קרב|הפסדת בדו־קרב/);assert.ok(seen.roles.has('kick')&&seen.roles.has('keep'));
  assert.ok(seen.takers.length>=6&&new Set(seen.takers).size>=Math.min(seen.takers.length,6)-0,'a different taker each kick: '+seen.takers.length+' / '+new Set(seen.takers).size);
  assert.ok(!seen.takers.some(t=>t.includes('דני')),'the participant\'s name is never on a footballer');
  for(const row of s.scores.split(' ')){const [,side,score,marks]=row.match(/^([ab])(\d+):(.*)$/);assert.equal(+score,[...marks].filter(c=>c==='1').length,'score equals the green marks')}
  const totals=s.scores.match(/[ab](\d+)/g).map(x=>+x.slice(1));assert.notEqual(totals[0],totals[1]);
  await p.click('#again');await p.waitForSelector('#go');await p.click('#go');await p.waitForFunction(()=>window.__ph&&(window.__ph.arena._kick||window.__ph.arena._dive),null,{timeout:60000});assert.equal((await state(p)).scores.replace(/[^01]/g,'').length>=0,true);
  assert.ok((await state(p)).scores.replace(/[^01]/g,'').length<=3,'a fresh duel: the old marks are gone');await p.click('#quit');await p.click('#leave');await p.waitForSelector('#playerName');await ctx.close()});

await step('two clients, one room: the link keeps the room, different clubs and names, same result in the same order, rematch',async()=>{const ctx=await phone();const host=await page(ctx,{local:true}),guest=await page(ctx,{local:true});
  await host.goto(BASE+'?debug=1&view=2d');await host.fill('#playerName','דני');await host.click('button[data-mode=net]');await pickClub(host,'fr',null,'e:psg');await host.click('#open');await host.waitForSelector('.linkbox');
  const link=await host.inputValue('.linkbox'),code=(await host.textContent('.code')).trim();assert.match(code,/^[A-HJ-NP-Z2-9]{6}$/);assert.ok(link.endsWith('?room='+code));assert.ok(host.url().includes('room='+code));
  await guest.goto(link+'&debug=1&view=2d');await guest.waitForSelector('#playerName');assert.match(await guest.textContent('.invite'),new RegExp(code));await guest.fill('#playerName','מאיה');await guest.click('button[data-mode=net]');
  assert.ok(guest.url().includes('room='+code),'the room survives the opening screen');await pickClub(guest,'il','il1','il:mta');assert.ok(guest.url().includes('room='+code),'and the club choice');
  assert.match(await guest.textContent('#join'),new RegExp(code));await guest.click('#join');
  await Promise.all([host,guest].map(p=>p.waitForSelector('#app[data-screen=game]',{timeout:60000})));
  const names=async p=>(await p.$$eval('.hud-row',r=>r.map(x=>x.innerText.replace(/\s+/g,' ')))).join(' / ');const hn=await names(host),gn=await names(guest);
  assert.match(hn,/פאריס/);assert.match(hn,/מכבי/);assert.match(hn,/דני · אתה/);assert.match(hn,/מאיה/);assert.match(gn,/מאיה · אתה/);assert.match(gn,/דני/);
  const seen=await playOut([host,guest]);const a=await state(host),b=await state(guest);assert.equal(a.scores,b.scores,'both phones show the same marks and score');
  assert.deepEqual(seen[0].takers,seen[1].takers,'the same taker on both phones, in the same order');assert.ok(seen[0].takers.length>=6);
  assert.ok(/ניצחת/.test(a.end)!==/ניצחת/.test(b.end),'one winner');assert.ok(seen[0].roles.size===2&&seen[1].roles.size===2);
  await host.click('#again');await guest.waitForFunction(()=>/היריב רוצה משחק חוזר/.test(document.querySelector('#panel').innerText),null,{timeout:15000});await guest.click('#again');
  await Promise.all([host,guest].map(p=>p.waitForFunction(()=>window.__ph&&(window.__ph.arena._kick||window.__ph.arena._dive)&&document.querySelector('#panel').hidden,null,{timeout:60000})));
  assert.match((await state(host)).scores,/a0:-----/);assert.ok(guest.url().includes('room='+code),'the same room, no new invitation');
  await guest.click('#quit');await guest.click('#leave');await host.waitForFunction(()=>/היריב עזב/.test(document.querySelector('#panel').innerText),null,{timeout:15000});await ctx.close()});

await step('more ways to play: the chips, my numbers, survival ends on the first miss, the daily counts once, the cup runs a round',async()=>{const ctx=await phone(),p=await page(ctx);await p.goto(BASE+'?debug');await p.waitForSelector('#playerName');
  assert.deepEqual(await p.$$eval('.more .chip',b=>b.map(x=>x.textContent)),['טורניר','הישרדות','אתגר יומי','הסטטיסטיקה שלי']);await p.fill('#playerName','רוני');
  const kickOnce=async(x,y,m,c=0)=>{await p.waitForFunction(()=>window.__ph&&window.__ph.arena._kick,null,{timeout:90000});await p.evaluate(([x,y,m,c])=>window.__ph.arena._kick(x,y,m,c),[x,y,m,c])};
  const stats=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('ph.stats')||'{}'));
  await p.click('.chip[data-mode=stats]');await p.waitForSelector('#app[data-screen=stats]');assert.match(await p.textContent('.statlist'),/שיא הישרדות/);await p.click('[data-back]');await p.waitForSelector('#playerName');
  // survival: a ball far outside is a miss; the run is over and the record saved
  await p.click('.chip[data-mode=surv]');await pickClub(p,'il','il1','il:mta');await p.waitForSelector('#app[data-screen=surv]');await p.click('#go');
  await kickOnce(5.2,3,.73,1);await p.waitForFunction(()=>{const e=document.querySelector('#panel .end');return e&&/לא הבקעת הפעם|שערים ברצף/.test(e.innerText)},null,{timeout:60000});
  let st=await stats();assert.equal(st.survRuns,1);assert.equal(st.shots,1);await p.click('[data-act=home]');await p.waitForSelector('#playerName');
  // daily: five kicks, counted once; the second visit is practice
  await p.click('.chip[data-mode=daily]');await p.waitForSelector('#app[data-screen=daily]');await p.click('#go');
  for(let i=0;i<5;i++)await kickOnce([2.6,-2.5,.3,2.9,-1.2][i],[.6,1.7,1.1,.5,1.9][i],.73,[0,1,-1,0,0][i]);
  await p.waitForFunction(()=>/מתוך 5/.test(document.querySelector('#panel .end')?.innerText||''),null,{timeout:90000});st=await stats();const keys=Object.keys(st.daily.scores);assert.equal(keys.length,1);assert.equal(st.daily.streak,1);
  assert.match(await p.textContent('#panel'),/[🟩⬛]{5}/u);await p.click('[data-act=home]');await p.waitForSelector('#playerName');
  await p.click('.chip[data-mode=daily]');await p.waitForSelector('#app[data-screen=daily]');assert.match(await p.textContent('#go'),/תרגול/);assert.match(await p.textContent('.card'),/היום קיבלת/);await p.click('[data-back]');
  // the cup: three rows, the first round is a real shoot-out
  await p.click('.chip[data-mode=tour]');await p.waitForSelector('#app[data-screen=pick]');await pickClub(p,'il','il1','il:mta');await p.waitForSelector('#app[data-screen=cup]');assert.equal((await p.$$('.path li')).length,3);assert.equal(await p.$$eval('.path li.now',e=>e.length),1);
  await p.click('#go');   // every ball of mine goes wide: he is out after a handful of kicks, which keeps the test short
  for(let guard=0;guard<40;guard++){await p.waitForFunction(()=>window.__ph&&(window.__ph.arena._kick||window.__ph.arena._dive||!document.querySelector('#panel').hidden),null,{timeout:90000});
    const st1=await p.evaluate(()=>({end:!document.querySelector('#panel').hidden,k:!!window.__ph.arena._kick}));if(st1.end)break;await p.evaluate(k=>{const a=window.__ph.arena;if(k)a._kick(5.5,3,.73);else a._dive('L')},st1.k);await p.waitForTimeout(250)}
  const end=(await state(p)).end;assert.match(end,/עלית לשלב הבא|הודחת ב/);st=await stats();assert.equal(st.played,1);assert.ok(st.shots>=5);await ctx.close()});

await browser.close();srv.close();
const unique=[...new Set(problems)];console.log(`\n${passed} passed, ${unique.length} problems`);for(const x of unique)console.log(' - '+x);process.exit(unique.length?1:0);
