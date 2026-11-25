import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';import {createServer} from '../scripts/serve.mjs';import fs from 'node:fs';
const srv=createServer().listen(5196);const out='/tmp/look';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:780},deviceScaleFactor:2,hasTouch:true,isMobile:true});const p=await ctx.newPage();
await p.goto('http://localhost:5196/?debug=1');await p.fill('#playerName','דני');await p.click('button[data-mode=cpu]');await p.click('.tile[data-country=fr]');await p.click('.tile[data-club="e:psg"]');await p.click('#choose');await p.click('.tile[data-country=il]');await p.click('.tile[data-league=il3n]');await p.click('.tile[data-club]');await p.click('#go');
await p.waitForFunction(()=>window.__ph&&window.__ph.arena.stage&&document.querySelector('.ar-load').hidden&&(window.__ph.arena._kick||window.__ph.arena._dive),null,{timeout:120000});
await p.addStyleTag({content:'.ar-debug,.ar-zones{display:none}'});let shots=0,kicks=0,dives=0;
for(let i=0;i<8&&shots<6;i++){await p.waitForFunction(()=>window.__ph.arena._kick||window.__ph.arena._dive,null,{timeout:60000});const kick=await p.evaluate(()=>!!window.__ph.arena._kick);
  if(kick&&kicks<1||!kick&&dives<1){const box=await p.locator('#arena').boundingBox();
    if(kick){await p.evaluate(([x,y])=>{const el=document.querySelector('#arena');el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:3,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true}))},[box.x+290,box.y+250]);await p.waitForTimeout(260);await p.screenshot({path:`${out}/kick-aim.png`});
      await p.evaluate(()=>window.__ph.arena.stage.pause());await p.evaluate(()=>window.__ph.arena._kick(2.9,1.9,.74))}
    else{await p.evaluate(([x,y])=>{const el=document.querySelector('#arena'),ev=(t,x,y)=>el.dispatchEvent(new PointerEvent(t,{pointerId:3,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true}));ev('pointerdown',x,y);ev('pointermove',x+95,y-10)},[box.x+200,box.y+250]);await p.waitForTimeout(200);await p.screenshot({path:`${out}/dive-aim.png`});
      await p.evaluate(()=>window.__ph.arena.stage.pause());await p.evaluate(()=>window.__ph.arena._dive('UL'))}
    await p.waitForFunction(()=>window.__ph.arena.stage.debug().keeper!=='wait',null,{timeout:20000});const tag=kick?'kick':'dive';
    await p.evaluate(()=>window.__ph.arena.stage.step(1.25+.45));await p.waitForTimeout(100);await p.screenshot({path:`${out}/${tag}-fly.png`});
    await p.evaluate(()=>window.__ph.arena.stage.step(.6));await p.waitForTimeout(250);await p.screenshot({path:`${out}/${tag}-result.png`});
    await p.evaluate(()=>{window.__ph.arena.stage.step(1.6)});await p.waitForTimeout(100);await p.screenshot({path:`${out}/${tag}-after.png`});
    await p.evaluate(()=>{window.__ph.arena.stage.step(3);window.__ph.arena.stage.resume()});kick?kicks++:dives++;shots++}
  else{await p.evaluate(()=>{const a=window.__ph.arena;a.stage.pause();a._kick?a._kick(0,1,.73):a._dive('C')});await p.waitForFunction(()=>window.__ph.arena.stage.debug().keeper!=='wait',null,{timeout:20000});await p.evaluate(()=>{window.__ph.arena.stage.step(8);window.__ph.arena.stage.resume()})}
  if(kicks&&dives)break;await p.waitForTimeout(900)}
await b.close();srv.close();console.log(fs.readdirSync(out).join(' '));
