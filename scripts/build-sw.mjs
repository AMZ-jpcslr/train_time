import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const names=(await readdir('dist',{recursive:true})).filter(name=>/\.(js|css|html|svg|png|woff2|webmanifest)$/.test(name)&&name!=='sw.js');
const hash=createHash('sha256');for(const name of names)hash.update(await readFile('dist/'+name));
const cache='mania-u-'+hash.digest('hex').slice(0,12);
const files=names.map(name=>'/'+name.replaceAll('\\','/'));
files.push('/');
await writeFile('dist/sw.js',`// Generated from this build's complete asset list. No external requests cached.
const CACHE=${JSON.stringify(cache)}, FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mania-u-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('/index.html'))||fetch(event.request)));return;
 }
 if(FILES.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
});
`);
console.log('PWA precache:',cache,files.length,'assets');
