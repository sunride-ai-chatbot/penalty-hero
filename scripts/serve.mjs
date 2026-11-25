// Minimal static server for local play and tests: correct MIME types, byte ranges (video on iOS needs them), no caching.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..',process.env.SERVE_DIR||'.');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.opus':'audio/ogg; codecs=opus','.m4a':'audio/mp4','.txt':'text/plain; charset=utf-8'};
export function createServer(root=ROOT){return http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';
  const file=path.join(root,p);if(!file.startsWith(root)){res.writeHead(403);return res.end()}
  fs.stat(file,(err,st)=>{if(err||!st.isFile()){res.writeHead(404,{'content-type':'text/plain'});return res.end('404 '+p)}
    const type=MIME[path.extname(file).toLowerCase()]||'application/octet-stream';const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
    const head={'content-type':type,'accept-ranges':'bytes','cache-control':'no-store'};
    if(range){const start=range[1]?+range[1]:0,end=range[2]?Math.min(+range[2],st.size-1):st.size-1;
      res.writeHead(206,{...head,'content-range':`bytes ${start}-${end}/${st.size}`,'content-length':end-start+1});return fs.createReadStream(file,{start,end}).pipe(res)}
    res.writeHead(200,{...head,'content-length':st.size});fs.createReadStream(file).pipe(res)})})}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=+process.env.PORT||5173;createServer().listen(port,()=>console.log(`Penalty Hero: http://localhost:${port}/`))}
