import {readFile} from 'node:fs/promises';
const DEFAULT_URL='https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
export function validCoordinate(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=-90&&p.lat<=90&&p.lon>=-180&&p.lon<=180;}
export function distanceMeters(a,b){const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 12742000*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
export function parseWalkingResponse(data,origin,entrance){
 const route=data?.routes?.[0];
 if(data?.code!=='Ok'||!route||!Number.isFinite(route.distance)||!Number.isFinite(route.duration)||route.distance<0||route.duration<0)throw Error('徒歩経路が見つかりませんでした。');
 if(!Array.isArray(data.waypoints)||data.waypoints.length!==2)throw Error('経路の出発点・到着点を確認できませんでした。');
 const snaps=data.waypoints.map((p,i)=>{
  if(!Array.isArray(p.location)||p.location.length!==2||!validCoordinate({lon:p.location[0],lat:p.location[1]})||!Number.isFinite(p.distance)||p.distance<0)throw Error('経路の位置情報が不正です。');
  const actual=distanceMeters(i===0?origin:entrance,{lat:p.location[1],lon:p.location[0]});
  if(actual>30||p.distance>30)throw Error('現在地または駅入口から歩行経路が離れすぎています。近くの入口を選ぶか、屋外で現在地を更新してください。');
  return Math.max(actual,p.distance);
 });
 const steps=route.legs?.flatMap(leg=>leg.steps??[]);
 if(!steps?.length||steps.some(step=>step.mode!=='walking'))throw Error('徒歩だけで到達できる経路を確認できませんでした。');
 if(route.distance+snaps[0]+snaps[1]+20<distanceMeters(origin,entrance))throw Error('経路距離を検証できませんでした。');
 const coords=route.geometry?.coordinates;
 if(route.geometry?.type!=='LineString'||!Array.isArray(coords)||coords.length<2||coords.some(p=>!Array.isArray(p)||!validCoordinate({lon:p[0],lat:p[1]})))throw Error('歩行経路の形状を検証できませんでした。');
 return {distanceMeters:route.distance+snaps[0]+snaps[1],roadDistanceMeters:route.distance,durationSeconds:route.duration+(snaps[0]+snaps[1])/1.25,snapDistances:snaps,geometry:coords,steps:steps.filter(s=>s.distance>0).map(s=>({distance:s.distance,name:s.name||'名称のない歩道',type:s.maneuver?.type,modifier:s.maneuver?.modifier})),dataVersion:data.data_version??null};
}
export function createWalkingService({fetchImpl=fetch,clock=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),entrances=[],contactEmail='',baseUrl=DEFAULT_URL,gate=null,appOrigin='http://127.0.0.1:4173',localPrototype=true,disabledReason=null,privacyUrl=null}={}){
 const cache=new Map(),inflight=new Map();let queue=Promise.resolve(),last=0,attempts=[],blockedUntil=0;
 const endpoint=new URL(baseUrl);
 if(endpoint.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname))throw Error('徒歩経路サーバーはHTTPSまたはローカル接続が必要です。');
 if(!/\/foot\/$/.test(endpoint.pathname))throw Error('徒歩専用の /foot/ エンドポイントを設定してください。');
 const publicProvider=endpoint.hostname==='routing.openstreetmap.de';
 const validEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)&&!/\r|\n/.test(contactEmail);
 const config={enabled:(!publicProvider||validEmail)&&!disabledReason,disabledReason:disabledReason||(publicProvider&&!validEmail?'経路サービス用の運営者メールアドレスを設定してください。':null),provider:publicProvider?'FOSSGIS / OSRM（徒歩）':'設定済み OSRM（徒歩）',contactEmail:validEmail?contactEmail:null,privacyUrl:publicProvider?'https://routing.openstreetmap.de/about.html':privacyUrl,localPrototype};
 async function acquire(origin,entrance,key){
  if(!config.enabled)throw Error(config.disabledReason);
  const cached=cache.get(key);if(cached&&clock()-cached.fetchedAt<10*60000)return {...cached,cached:true};
  if(clock()<blockedUntil)throw Error('経路サービスが混雑しています。しばらく待って再度お試しください。');
  attempts=attempts.filter(t=>clock()-t<86400000);
  if(attempts.length>=120||attempts.filter(t=>clock()-t<3600000).length>=30)throw Error(`${localPrototype?'ローカル':'公開'}試用の経路取得上限に達しました（30回/時・120回/日）。`);
  await wait(Math.max(0,1100-(clock()-last)));last=clock();attempts.push(last);
  const url=new URL(`${origin.lon},${origin.lat};${entrance.lon},${entrance.lat}`,endpoint);
  url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'true',alternatives:'false',radiuses:'30;30',generate_hints:'false'}).toString();
  const release=await gate?.acquire();let result;
  try{
   let response;
   try{response=await fetchImpl(url,{headers:{'User-Agent':`Maniau${localPrototype?'Local':''}Prototype/0.3${validEmail?' (contact: '+contactEmail+')':''}`,'Referer':new URL('/',appOrigin).href},signal:AbortSignal.timeout(20000)});}catch{blockedUntil=clock()+30000;await gate?.backoff(30000);throw Error('徒歩経路の取得に失敗しました。通信状態を確認してください。');}
   if(!response.ok){if(response.status===429||response.status>=500){const delay=response.status===429?60000:30000;blockedUntil=clock()+delay;await gate?.backoff(delay);}if(response.status===400)throw Error('現在地または入口の近くに歩行可能な道路が見つかりません。別の入口を選ぶか、屋外で現在地を更新してください。');throw Error(`徒歩経路サービスに接続できませんでした（HTTP ${response.status}）。`);}
   result={...parseWalkingResponse(await response.json(),origin,entrance),kind:'route',entranceId:entrance.id,origin,fetchedAt:clock(),provider:config.provider,cached:false};
  }finally{await release?.();}
  cache.set(key,result);while(cache.size>120)cache.delete(cache.keys().next().value);
  return result;
 }
 async function route(input){
  if(!validCoordinate(input?.origin))throw Error('現在地の緯度・経度が不正です。');
  const entrance=entrances.find(e=>e.id===input.entranceId&&e.stationId===input.stationId);
  if(!entrance)throw Error('確認済みの駅入口を選んでください。');
  if(distanceMeters(input.origin,entrance)>25000)throw Error('この試作版の徒歩検索は駅入口から直線25km以内です。');
  const origin={lat:Number(input.origin.lat.toFixed(6)),lon:Number(input.origin.lon.toFixed(6))};
  const key=`${origin.lat},${origin.lon}:${entrance.id}`;
  if(inflight.has(key))return inflight.get(key);
  const task=queue.then(()=>acquire(origin,entrance,key));queue=task.catch(()=>{});inflight.set(key,task);
  try{return await task;}finally{inflight.delete(key);}
 }
 return {route,config};
}
export async function loadWalkingService(env=process.env){
 const entrances=JSON.parse(await readFile(new URL('../src/data/entrances.json',import.meta.url),'utf8'));
 return createWalkingService({entrances,contactEmail:env.ROUTING_CONTACT_EMAIL??'',baseUrl:env.ROUTING_FOOT_URL||DEFAULT_URL});
}
