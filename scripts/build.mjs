// Copies what the game needs at run time into dist/ (static files: any web host can serve the folder as it is).
// It also checks that the app and the service worker carry the same version, so code and caches cannot drift apart.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.join(ROOT,'dist');
const version=fs.readFileSync(path.join(ROOT,'src/version.js'),'utf8').match(/VERSION='([^']+)'/)[1];
if(!fs.readFileSync(path.join(ROOT,'sw.js'),'utf8').includes(`VERSION='${version}'`))throw new Error('sw.js and src/version.js disagree on the version');
if(!fs.existsSync(path.join(ROOT,'data/catalog.json')))throw new Error('data/catalog.json is missing: run `npm run catalog -- <source checkout>` first');
fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT);
for(const f of ['index.html','app.webmanifest','sw.js','src','assets','data','config','vendor'])fs.cpSync(path.join(ROOT,f),path.join(OUT,f),{recursive:true});
for(const f of ['goal.png','miss.png','pendel24.png'])fs.rmSync(path.join(OUT,'assets/penalties29/taker',f),{force:true});   // the source PNG plates stay in the project; the game loads the .webp copies
if(process.argv.includes('--bundle')){   // every squad in one file, for hosts that limit the number of files
  const cat=JSON.parse(fs.readFileSync(path.join(OUT,'data/catalog.json'),'utf8')),all={};for(const c of Object.values(cat.clubs))all[c.id]=JSON.parse(fs.readFileSync(path.join(OUT,'data',c.squad),'utf8'));
  fs.writeFileSync(path.join(OUT,'data/squads-all.json'),JSON.stringify(all));fs.rmSync(path.join(OUT,'data/squads'),{recursive:true});cat.bundle='squads-all.json';
  const dir=path.join(OUT,'assets/facepacks');cat.faceShards={};let cur={},size=0,n=0;const flush=()=>{if(!size)return;fs.writeFileSync(path.join(dir,`shard-${n}.json`),JSON.stringify(cur));n++;cur={};size=0};
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort()){const p=path.join(dir,f),name=f.replace(/\.json$/,'');cur[name]=JSON.parse(fs.readFileSync(p,'utf8'));size+=fs.statSync(p).size;cat.faceShards[name]=`shard-${n}.json`;fs.rmSync(p);if(size>1.1e6)flush()}flush();fs.writeFileSync(path.join(OUT,'data/catalog.json'),JSON.stringify(cat))}
let n=0,bytes=0;(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else{n++;bytes+=fs.statSync(p).size}}})(OUT);
console.log(`dist/ ready: version ${version}, ${n} files, ${(bytes/1048576).toFixed(1)} MB`);
