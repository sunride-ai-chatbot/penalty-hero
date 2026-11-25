// consecutive film frames, zoomed on the taker's back: does the print ride the shirt?
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';import {createServer} from '../scripts/serve.mjs';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const out='/tmp/lab';fs.mkdirSync(out,{recursive:true});const srv=createServer().listen(5194);const q=process.argv[2]||'?kit=%23ffffff&trim=%23111111';const times=(process.argv[3]||'').split(',').filter(Boolean).map(Number);
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:390,height:700},deviceScaleFactor:2});await p.goto('http://localhost:5194/dev/harness.html'+q);await p.waitForFunction('window.isReady===true',null,{timeout:60000});await p.waitForTimeout(800);
await p.evaluate(()=>{window.v.pause();window.shoot({x:2.6,y:1.9,how:'goal',power:80,flight:.6,keeper:{dir:'L',z:-1.9,row:1,delay:.2}})});
const ts=times.length?times:Array.from({length:18},(_,i)=>i*130+60);let now=0;const files=[];
for(const t of ts){await p.evaluate(d=>window.v.step(d),(t-now)/1000);now=t;const f=`${out}/L${t}.png`;await p.screenshot({path:f});files.push(f)}
await b.close();srv.close();
execFileSync('python3',['-c',`
from PIL import Image
import sys
fs=sys.argv[2:];cols=6;tiles=[]
for f in fs:
    im=Image.open(f);tiles.append(im.crop((0,560,420,1000)).resize((252,264)))
rows=(len(tiles)+cols-1)//cols;s=Image.new('RGB',(252*cols,264*rows))
for i,t in enumerate(tiles): s.paste(t,((i%cols)*252,(i//cols)*264))
s.save(sys.argv[1])`,out+'/labels.png',...files]);
