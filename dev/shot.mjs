import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';import {createServer} from '../scripts/serve.mjs';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const out=process.argv[2]||'/tmp/shots';fs.mkdirSync(out,{recursive:true});const shot=JSON.parse(process.argv[3]||'{"x":2.6,"y":1.9,"how":"goal","power":80,"flight":0.6,"keeper":{"dir":"L","z":-1.9,"row":1,"delay":0.2}}');
const times=(process.argv[4]||'0,600,1150,1300,1500,1800,2300,2900,3600').split(',').map(Number);const query=process.argv[5]||'';
const srv=createServer().listen(5199);
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:390,height:700},deviceScaleFactor:1});const logs=[];p.on('console',m=>{if(!/GPU stall/.test(m.text()))logs.push(m.type()+': '+m.text())});p.on('pageerror',e=>logs.push('ERR '+e.message));p.on('response',r=>{if(r.status()>=400)logs.push(r.status()+' '+r.url())});
await p.goto('http://localhost:5199/dev/harness.html'+query);await p.waitForFunction('window.isReady===true',null,{timeout:60000});await p.waitForTimeout(1500);
await p.evaluate(()=>window.v.pause());const files=[];let now=0,fired=false;
for(const t of times){if(!fired&&t>0){await p.evaluate(s=>window.shoot(s),shot);fired=true}
  await p.evaluate(d=>window.v.step(d),Math.max(0,(t-now)/1000));now=t;const f=out+'/t'+t+'.png';await p.screenshot({path:f});files.push(f);
  if(!fired){await p.evaluate(s=>window.shoot(s),shot);fired=true}}
console.log(JSON.stringify(await p.evaluate(()=>window.v.debug())));console.log(logs.join('\n'));await b.close();srv.close();
execFileSync('python3',['-c',`
from PIL import Image
import sys
fs=sys.argv[2:];ims=[Image.open(f) for f in fs];w,h=ims[0].size;cols=min(5,len(ims));rows=(len(ims)+cols-1)//cols
s=Image.new('RGB',(w*cols,h*rows))
for i,im in enumerate(ims): s.paste(im,((i%cols)*w,(i//cols)*h))
s.save(sys.argv[1])`,out+'/sheet.png',...files]);
