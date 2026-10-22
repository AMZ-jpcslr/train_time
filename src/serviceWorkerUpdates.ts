export type UpdateState={phase:'idle'|'checking'|'current'|'available'|'applying'|'offline'|'error';message:string};
let state:UpdateState={phase:'idle',message:''};
const listeners=new Set<()=>void>();
let registration:ServiceWorkerRegistration|undefined;
let started=false,reloading=false;
let lastCheck=0;
let checking:Promise<void>|undefined;
let retryRegistration:(()=>Promise<void>)|undefined;
let applyTimer:ReturnType<typeof setTimeout>|undefined;
const publish=(next:UpdateState)=>{state=next;listeners.forEach(listener=>listener());};
export const subscribePwaUpdate=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const getPwaUpdate=()=>state;
const available=()=>publish({phase:'available',message:'新しいバージョンが使えます。登録地点・お気に入りを残して画面を更新します。入力途中の内容は更新前に保存してください。'});
function observe(worker:ServiceWorker){
 worker.addEventListener('statechange',()=>{
  if(worker.state==='installed'&&navigator.serviceWorker.controller)available();
  if(worker.state==='activated'&&state.phase==='checking')publish({phase:'current',message:'アプリの更新を確認しました。'});
  if(worker.state==='redundant'&&state.phase==='checking')publish({phase:'error',message:'更新を取得できませんでした。現在の画面を引き続き利用できます。'});
 });
}
export function checkPwaUpdate(manual=false):Promise<void>{
 if(!registration)return manual&&retryRegistration?retryRegistration():Promise.resolve();
 if(registration.waiting){available();return Promise.resolve();}
 if(checking)return checking;
 if(!navigator.onLine){publish({phase:'offline',message:'オフラインです。通信が戻るとアプリの更新を確認します。'});return Promise.resolve();}
 if(!manual&&Date.now()-lastCheck<60000)return Promise.resolve();
 lastCheck=Date.now();publish({phase:'checking',message:'アプリの更新を確認しています…'});
 checking=registration.update().then(()=>{
  if(registration?.waiting)available();
  else if(!registration?.installing)publish({phase:'current',message:'アプリの更新を確認しました。'});
 }).catch(()=>publish({phase:'error',message:'更新を確認できませんでした。通信を確認して再度お試しください。'})).finally(()=>{checking=undefined;});
 return checking;
}
export function applyPwaUpdate(){
 if(!registration?.waiting){void checkPwaUpdate(true);return;}
 publish({phase:'applying',message:'新しいバージョンへ切り替えています…'});
 clearTimeout(applyTimer);
 applyTimer=setTimeout(()=>{if(!reloading)publish({phase:'error',message:'更新の切り替えを確認できませんでした。もう一度お試しください。'});},10000);
 registration.waiting.postMessage({type:'SKIP_WAITING'});
}
export function startPwaUpdates(){
 if(started||!('serviceWorker' in navigator))return;
 started=true;
 let wasControlled=Boolean(navigator.serviceWorker.controller);
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  // First installation does not need a reload. Later activations replace all open app tabs.
  if(!wasControlled){wasControlled=true;publish({phase:'current',message:'アプリをオフラインでも開く準備ができました。'});return;}
  if(reloading)return;
  reloading=true;clearTimeout(applyTimer);window.location.reload();
 });
 const start=async()=>{
  try{
   registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
   registration.addEventListener('updatefound',()=>{if(registration?.installing)observe(registration.installing);});
   if(registration.installing)observe(registration.installing);
   if(registration.waiting)available();else void checkPwaUpdate();
  }catch{publish({phase:'error',message:'オフライン用データを準備できませんでした。オンラインではこのまま使えます。'});}
 };
 retryRegistration=start;
 if(document.readyState==='complete')void start();else window.addEventListener('load',()=>void start(),{once:true});
 const resume=()=>{if(document.visibilityState==='visible')void checkPwaUpdate();};
 document.addEventListener('visibilitychange',resume);window.addEventListener('pageshow',resume);
 window.addEventListener('online',()=>{lastCheck=0;void checkPwaUpdate();});
}
