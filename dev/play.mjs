// plays a whole computer duel through the test hooks and screenshots the key moments
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';import {createServer} from '../scripts/serve.mjs';import fs from 'node:fs';
const srv=createServer().listen(5197);const out='/tmp/play';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:780},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const p=await ctx.newPage();const logs=[];p.on('console',m=>{if(!/GPU stall/.test(m.text()))logs.push(m.type()+': '+m.text())});p.on('pageerror',e=>logs.push('ERR '+e.message));p.on('response',r=>{if(r.status()>=400)logs.push(r.status()+' '+r.url())});
await p.goto('http://localhost:5197/?debug=1');await p.waitForSelector('#playerName');await p.fill('#playerName','דני');await p.click('button[data-mode=cpu]');
await p.click('.tile[data-country=il]');await p.click('.tile[data-league=il1]');await p.click('.tile[data-club="il:mta"]');await p.click('#draw');await p.click('#go');
const seen=[];let n=0;
for(let i=0;i<400;i++){
  const st=await p.evaluate(()=>{const a=window.__ph&&window.__ph.arena;const panel=document.querySelector('#panel');return {end:panel&&!panel.hidden?panel.innerText:null,kick:!!(a&&a._kick),dive:!!(a&&a._dive),who:document.querySelector('#who')?.innerText.replace(/\n/g,' | '),score:[...document.querySelectorAll('.score')].map(e=>e.textContent).join(':'),dbg:a&&a.stage?a.stage.debug():null}});
  if(st.end){console.log('END',st.end.replace(/\n/g,' | '),'score',st.score);await p.screenshot({path:out+'/end.png'});break}
  if(st.kick||st.dive){n++;seen.push(st.who);if(n<=3)await p.screenshot({path:`${out}/ask${n}.png`});
    if(st.kick)await p.evaluate(n=>window.__ph.arena._kick([2.9,-2.8,0.2,3.0,-3.9][n%5],[0.5,1.9,1.2,2.0,1.0][n%5],0.74),n);else await p.evaluate(n=>window.__ph.arena._dive(['L','DR','UL','C','R'][n%5]),n);
    // fast-forward the picture
    for(let j=0;j<60;j++){const d=await p.evaluate(()=>{const a=window.__ph&&window.__ph.arena;if(!a||!a.stage)return null;a.stage.step(.1);return a.stage.debug()});if(n<=3&&j===22)await p.screenshot({path:`${out}/mid${n}.png`});if(n<=3&&j===45)await p.screenshot({path:`${out}/late${n}.png`});await p.waitForTimeout(15)}
  }
  await p.waitForTimeout(120)}
console.log(seen.join('\n'));console.log(logs.join('\n'));await b.close();srv.close();
