import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const names=(await readdir('dist',{recursive:true})).filter(name=>/\.(js|css|html|svg|png|woff2|webmanifest)$/.test(name)&&name!=='sw.js').sort();
// Include lifecycle changes, so editing only this generator also creates a new cache.
const hash=createHash('sha256').update(await readFile(new URL(import.meta.url)));for(const name of names)hash.update(await readFile('dist/'+name));
const cache='mania-u-v2-'+hash.digest('hex').slice(0,12);
const files=names.map(name=>'/'+name.replaceAll('\\','/'));
files.push('/');
await writeFile('dist/sw.js',`// Generated from this build's complete asset list. No external requests cached.
const CACHE=${JSON.stringify(cache)}, FILES=${JSON.stringify(files)};
const legacy=key=>key.startsWith('mania-u-')&&!key.startsWith('mania-u-v2-');
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 // Activate only after the whole new offline app is downloaded successfully.
 await cache.addAll(FILES.map(file=>new Request(file,{cache:'reload'})));
 // Legacy pages have no update controls/controllerchange handler. Migrate them once.
 if(self.registration.active&&(await caches.keys()).some(legacy))await self.skipWaiting();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING'&&event.source?.url&&new URL(event.source.url).origin===self.location.origin)event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys(),migrate=keys.some(legacy);
 // Record old windows before claim; no localStorage, settings or GPS data is touched.
 const windows=migrate?await self.clients.matchAll({type:'window',includeUncontrolled:true}):[];
 await Promise.all(keys.filter(key=>key.startsWith('mania-u-')&&key!==CACHE).map(key=>caches.delete(key)));
 await self.clients.claim();
 // Do not await navigation inside activate: its fetch can itself wait for activation.
 if(migrate)for(const client of windows.filter(client=>client.url.startsWith(self.registration.scope)))void client.navigate(client.url).catch(()=>{});
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 // Versioned station files are loaded only when selected; keep the latest 16 for offline use.
 if(new RegExp('^/data/odpt/odpt-[a-z]+-[a-f0-9]{16}-[a-f0-9]{12}[.]json$').test(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE),saved=await cache.match(url.pathname);
   if(saved)return saved;
   const response=await fetch(event.request);
   if(response.ok&&response.headers.get('content-type')?.includes('application/json')){
    const data=await response.clone().json();
    if(Array.isArray(data)&&data.length&&data.every(t=>t.stationId&&Array.isArray(t.departures))){
     await cache.put(url.pathname,response.clone());
     const keys=(await cache.keys()).filter(r=>new URL(r.url).pathname.startsWith('/data/odpt/'));
     for(const key of keys.slice(0,Math.max(0,keys.length-16)))await cache.delete(key);
    }
   }
   return response;
  })());return;
 }
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),3000);
   try{const response=await fetch(event.request,{cache:'no-cache',signal:controller.signal});if(response.ok)return response;}
   catch{/* Offline or unreachable: use only a completely installed app snapshot. */}
   finally{clearTimeout(timeout);}
   return (await caches.open(CACHE).then(cache=>cache.match('/index.html')))||Response.error();
  })());return;
 }
 if(FILES.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
});
`);
console.log('PWA precache:',cache,files.length,'assets');
