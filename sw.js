// Penalty Hero service worker. One cache per version: code, data and media of different versions are never mixed.
// Pages, code and data: network first (an update arrives as soon as there is a connection), cache when offline.
// Heavy media: cache first inside this version's cache. Network play itself never comes from a cache — a room needs a live connection.
const VERSION='1.3.2';const CACHE='penalty-hero-'+VERSION;
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('penalty-hero-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(req.headers.has('range'))return;                                  // video ranges go straight to the network
  if(/\/config\/network\.json$/.test(url.pathname))return;             // the network settings are always read live
  const media=/\/assets\/.+\.(webp|png|jpg|mp4|opus|m4a)$/.test(url.pathname);
  if(media){e.respondWith(caches.open(CACHE).then(c=>c.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok&&res.status===200)c.put(req,res.clone());return res}))));return}
  e.respondWith(fetch(req).then(res=>{if(res.ok&&res.status===200){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res}).catch(()=>caches.open(CACHE).then(c=>c.match(req,{ignoreSearch:req.mode==='navigate'})).then(hit=>hit||Response.error())))});
