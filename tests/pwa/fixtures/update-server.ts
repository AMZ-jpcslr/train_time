import {createServer,type Server} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import type {AddressInfo} from 'node:net';

export type Release='legacy'|'current'|'next'|'broken';
const OLD_CACHE='mania-u-legacy-update-test';
const marker=(release:Release)=>`<script>document.documentElement.dataset.testRelease=${JSON.stringify(release)};sessionStorage.setItem('pwa-test-loads',String(Number(sessionStorage.getItem('pwa-test-loads')||0)+1));</script>`;
const oldHtml=`<!doctype html><html lang="ja"><head><meta charset="utf-8">${marker('legacy')}</head><body><h1>旧版の画面</h1><select aria-label="旧版の駅選択"><option>今出川</option></select><script>addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'));</script></body></html>`;
// Deliberately has no skipWaiting, update UI, message listener, or controllerchange listener.
// This reproduces the released cache-first worker and an already installed old main bundle.
const oldWorker=`const CACHE=${JSON.stringify(OLD_CACHE)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/index.html']))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('/index.html'))||fetch(event.request)));});`;

const MIME:Record<string,string>={js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',html:'text/html; charset=utf-8',json:'application/json',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',woff2:'font/woff2'};

/** Real HTTP and real browser ServiceWorker lifecycle; no SW or fetch mocks. */
export async function startUpdateServer(initial:Release='legacy'){
 const dist=fileURLToPath(new URL('../../../dist/',import.meta.url));
 const files=new Map<string,Buffer>();
 for(const name of await readdir(dist,{recursive:true})){
  if(!/\.(js|css|html|svg|png|woff2|webmanifest)$/.test(name))continue;
  files.set('/'+name.replaceAll('\\','/'),await readFile(dist+'/'+name));
 }
 const worker=files.get('/sw.js')?.toString();
 const html=files.get('/index.html')?.toString();
 if(!worker||!html||!worker.includes('mania-u-v2-'))throw Error('Run the current npm run build before PWA update tests.');
 const brokenAsset=[...files.keys()].find(path=>/^\/assets\/.*\.js$/.test(path));
 if(!brokenAsset)throw Error('A production JavaScript asset is required for the failed-update regression.');
 let release=initial;
 const requests:{path:string;release:Release;status:number}[]=[];
 const server:Server=createServer((request,response)=>{
  const path=new URL(request.url??'/', 'http://localhost').pathname;
  let status=200,content:Buffer|string,mime='text/html; charset=utf-8';
  if(path==='/api/config'){
   mime='application/json';content=JSON.stringify({enabled:false,contactEmail:null,provider:'Offline regression fixture'});
  }else if(path.startsWith('/api/')){
   status=503;mime='application/json';content=JSON.stringify({error:'No live timetable or routing requests in the update fixture.'});
  }else if(path==='/sw.js'){
   mime=MIME.js;
   content=release==='legacy'?oldWorker:worker.replace(/mania-u-v2-[a-zA-Z0-9-]+/g,`mania-u-v2-update-test-${release}`);
  }else if(path==='/'||path==='/index.html'){
   content=release==='legacy'?oldHtml:html.replace('</head>',`${marker(release)}</head>`);
  }else if(release==='broken'&&path===brokenAsset){status=503;content='Intentional incomplete deployment';}
  else if(files.has(path)){content=files.get(path)!;mime=MIME[path.split('.').pop()??'']??'application/octet-stream';}
  else{status=404;content='Not found';}
  requests.push({path,release,status});
  response.writeHead(status,{'Content-Type':mime,'Cache-Control':'no-store','Service-Worker-Allowed':'/'});
  response.end(content);
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 return {
  origin,requests,brokenAsset,
  release:(next:Release)=>{release=next;},
  close:()=>new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();}),
 };
}
