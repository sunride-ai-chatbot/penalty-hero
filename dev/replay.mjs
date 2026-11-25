import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';import {createServer} from '../scripts/serve.mjs';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const out='/tmp/rp';fs.mkdirSync(out,{recursive:true});const srv=createServer().listen(5198);
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:390,height:700}});const logs=[];p.on('pageerror',e=>logs.push('ERR '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/GPU stall|404/.test(m.text()))logs.push(m.text())});
await p.goto('http://localhost:5198/dev/harness.html'+(process.argv[3]||''));await p.waitForFunction('window.isReady===true',null,{timeout:60000});await p.waitForTimeout(9000);
const shot=JSON.parse(process.argv[2]);await p.evaluate(()=>window.v.pause());await p.evaluate(s=>window.shoot(s),shot);await p.evaluate(()=>window.v.step(6));
await p.evaluate(s=>window.replay(s),shot);const files=[];let t=0;for(const d of [.05,.3,.3,.3,.3,.3,.4,.5,.6,.9]){await p.evaluate(x=>window.v.step(x*.5),d);t+=d;const f=out+'/r'+files.length+'.png';await p.screenshot({path:f});files.push(f)}
console.log(JSON.stringify(await p.evaluate(()=>window.v.debug())),logs.join('|'));await b.close();srv.close();
execFileSync('python3',['-c',`
from PIL import Image
import sys
fs=sys.argv[2:];ims=[Image.open(f) for f in fs];w,h=ims[0].size;cols=5;rows=2
s=Image.new('RGB',(w*cols,h*rows))
for i,im in enumerate(ims): s.paste(im,((i%cols)*w,(i//cols)*h))
s.save(sys.argv[1])`,out+'/sheet.png',...files]);
