// how many bytes and requests stand between "לנקודה הלבנה" and a ready arena
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';import {createServer} from '../scripts/serve.mjs';
const srv=createServer().listen(5195);const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:390,height:780}});const got=[];p.on('response',async r=>{try{const l=+(r.headers()['content-length']||0);got.push([Date.now(),r.url().split('/').pop().split('?')[0],l])}catch(e){}});
await p.goto('http://localhost:5195/?debug=1');await p.fill('#playerName','x');await p.waitForTimeout(3000);await p.click('button[data-mode=cpu]');await p.click('.tile[data-country=fr]');await p.click('.tile[data-club="e:psg"]');await p.click('#draw');await p.waitForSelector('#go');
const t0=Date.now();await p.click('#go');await p.waitForFunction(()=>window.__ph&&window.__ph.arena.stage&&document.querySelector('.ar-load').hidden,null,{timeout:120000});const t1=Date.now();
const before=got.filter(g=>g[0]<t0),after=got.filter(g=>g[0]>=t0&&g[0]<=t1);const mb=a=>(a.reduce((t,g)=>t+g[2],0)/1048576).toFixed(1);
console.log('arena ready after',((t1-t0)/1000).toFixed(1)+'s (software GL)');console.log('fetched before the duel:',before.length,'files',mb(before),'MB');console.log('fetched after pressing start:',after.length,'files',mb(after),'MB',after.filter(g=>g[2]>200000).map(g=>g[1]+' '+(g[2]/1048576).toFixed(1)+'MB').join(', '));
await b.close();srv.close();
