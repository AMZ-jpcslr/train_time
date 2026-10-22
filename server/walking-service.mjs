import {readFile} from 'node:fs/promises';
const DEFAULT_URL='https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
export const MAX_ROAD_SNAP_METERS=200;
export const MAX_PENDING_ROUTES=8;
export const MAX_WALKING_RESPONSE_BYTES=2*1024*1024;
export const MAX_GEOMETRY_POINTS=20000;
export const MAX_WALKING_STEPS=2000;
const CACHE_TTL_MS=10*60000,MAX_CACHE_BYTES=8*1024*1024;
class ResponseLimitError extends Error{constructor(){super('徒歩経路サービスの応答が大きすぎるため取得を中止しました。');}}
async function cancelBody(response){try{await response.body?.cancel();}catch{/* A closed or aborted body needs no further work. */}}
async function readWalkingJson(response){
 const declared=Number(response.headers?.get('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_WALKING_RESPONSE_BYTES){await cancelBody(response);throw new ResponseLimitError();}
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{
   for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_WALKING_RESPONSE_BYTES)throw new ResponseLimitError();chunks.push(value);}
  }catch(error){try{await reader.cancel();}catch{/* Preserve the original read error. */}throw error;}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));
 }
 // Custom fetch adapters can provide parsed JSON only; bound it before use/cache.
 // Native fetch always takes the streamed branch, including chunked responses.
 const data=await response.json();if(Buffer.byteLength(JSON.stringify(data))>MAX_WALKING_RESPONSE_BYTES)throw new ResponseLimitError();return data;
}
function providerError(code){
 if(code==='NoSegment')return `現在地または駅入口から${MAX_ROAD_SNAP_METERS}m以内に、経路サービスが利用できる歩道・道路が見つかりませんでした。屋外で現在地を更新するか、別の入口を選んでください。`;
 if(code==='NoRoute')return '出発側と駅入口側を結ぶ徒歩経路が見つかりませんでした。別の入口や地図サービスで経路を確認してください。';
 if(['InvalidUrl','InvalidService','InvalidVersion','InvalidOptions','InvalidQuery','InvalidValue','TooBig'].includes(code))return `徒歩経路サービスが検索条件を処理できませんでした（${code}）。アプリの設定・更新状況を確認してください。`;
 return null;
}
export function validCoordinate(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=-90&&p.lat<=90&&p.lon>=-180&&p.lon<=180;}
export function distanceMeters(a,b){const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 12742000*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
export function parseWalkingResponse(data,origin,entrance){
 const route=data?.routes?.[0];
 if(data?.code!=='Ok')throw Error(providerError(data?.code)||'徒歩経路サービスの応答を確認できませんでした。');
 if(!route||!Number.isFinite(route.distance)||!Number.isFinite(route.duration)||route.distance<0||route.duration<0)throw Error('徒歩経路が見つかりませんでした。');
 if(!Array.isArray(data.waypoints)||data.waypoints.length!==2)throw Error('経路の出発点・到着点を確認できませんでした。');
 const snaps=data.waypoints.map((p,i)=>{
  if(!Array.isArray(p?.location)||p.location.length!==2||!validCoordinate({lon:p.location[0],lat:p.location[1]})||!Number.isFinite(p.distance)||p.distance<0)throw Error('経路の位置情報が不正です。');
  const actual=distanceMeters(i===0?origin:entrance,{lat:p.location[1],lon:p.location[0]});
  if(actual>MAX_ROAD_SNAP_METERS||p.distance>MAX_ROAD_SNAP_METERS)throw Error('現在地または駅入口から歩行経路が離れすぎています。近くの入口を選ぶか、屋外で現在地を更新してください。');
  return Math.max(actual,p.distance);
 });
 if(!Array.isArray(route.legs)||route.legs.length!==1||!Array.isArray(route.legs[0]?.steps))throw Error('徒歩だけで到達できる経路を確認できませんでした。');
 const steps=route.legs[0].steps;
 if(!steps.length||steps.length>MAX_WALKING_STEPS||steps.some(step=>step?.mode!=='walking'))throw Error('徒歩だけで到達できる経路を確認できませんでした。');
 const text=(value,max)=>value===undefined||(typeof value==='string'&&value.length<=max);
 if(steps.some(step=>!Number.isFinite(step.distance)||step.distance<0||!text(step.name,512)||!text(step.maneuver?.type,64)||!text(step.maneuver?.modifier,64))||!(data.data_version==null||text(data.data_version,128)))throw Error('徒歩経路の案内情報を検証できませんでした。');
 if(route.distance+snaps[0]+snaps[1]+20<distanceMeters(origin,entrance))throw Error('経路距離を検証できませんでした。');
 const coords=route.geometry?.coordinates;
 if(route.geometry?.type!=='LineString'||!Array.isArray(coords)||coords.length<2||coords.length>MAX_GEOMETRY_POINTS||coords.some(p=>!Array.isArray(p)||p.length!==2||!validCoordinate({lon:p[0],lat:p[1]})))throw Error('歩行経路の形状を検証できませんでした。');
 const snapLocations=data.waypoints.map(p=>[...p.location]);
 if([coords[0],coords.at(-1)].some((point,i)=>distanceMeters({lon:point[0],lat:point[1]},{lon:snapLocations[i][0],lat:snapLocations[i][1]})>5))throw Error('歩行経路の端点と道路への接続位置が一致しませんでした。');
 // Snaps are straight map offsets, not verified walkable connections. The UI
 // keeps any offset over 30m out of the boarding judgment and displays it separately.
 return {distanceMeters:route.distance+snaps[0]+snaps[1],roadDistanceMeters:route.distance,roadDurationSeconds:route.duration,durationSeconds:route.duration+(snaps[0]+snaps[1])/1.25,snapDistances:snaps,snapLocations,destination:{lat:entrance.lat,lon:entrance.lon},geometry:coords,steps:steps.filter(s=>s.distance>0).map(s=>({distance:s.distance,name:s.name||'名称のない歩道',type:s.maneuver?.type,modifier:s.maneuver?.modifier})),dataVersion:data.data_version??null};
}
export function createWalkingService({fetchImpl=fetch,clock=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),entrances=[],contactEmail='',baseUrl=DEFAULT_URL,gate=null,appOrigin='http://127.0.0.1:4173',localPrototype=true,disabledReason=null,privacyUrl=null}={}){
 const cache=new Map(),inflight=new Map();let cacheBytes=0,queue=Promise.resolve(),last=0,attempts=[],blockedUntil=0;
 function dropCached(key){const entry=cache.get(key);if(entry){clearTimeout(entry.timer);cacheBytes-=entry.bytes;cache.delete(key);}}
 function cleanCache(){const now=clock();for(const[key,entry]of cache){if(now<entry.value.fetchedAt||now-entry.value.fetchedAt>=CACHE_TTL_MS)dropCached(key);}}
 function remember(key,value){
  cleanCache();dropCached(key);const bytes=Buffer.byteLength(JSON.stringify(value));
  while(cache.size&&(cache.size>=120||cacheBytes+bytes>MAX_CACHE_BYTES))dropCached(cache.keys().next().value);
  if(bytes>MAX_CACHE_BYTES)return;
  const timer=setTimeout(()=>dropCached(key),CACHE_TTL_MS);timer.unref?.();cache.set(key,{value,bytes,timer});cacheBytes+=bytes;
 }
 const endpoint=new URL(baseUrl);
 if(endpoint.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname))throw Error('徒歩経路サーバーはHTTPSまたはローカル接続が必要です。');
 if(!/\/foot\/$/.test(endpoint.pathname))throw Error('徒歩専用の /foot/ エンドポイントを設定してください。');
 const publicProvider=endpoint.hostname==='routing.openstreetmap.de';
 const validEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)&&!/\r|\n/.test(contactEmail);
 const config={enabled:(!publicProvider||validEmail)&&!disabledReason,disabledReason:disabledReason||(publicProvider&&!validEmail?'経路サービス用の運営者メールアドレスを設定してください。':null),provider:publicProvider?'FOSSGIS / OSRM（徒歩）':'設定済み OSRM（徒歩）',contactEmail:validEmail?contactEmail:null,privacyUrl:publicProvider?'https://routing.openstreetmap.de/about.html':privacyUrl,localPrototype};
 async function acquire(origin,entrance,key){
  if(!config.enabled)throw Error(config.disabledReason);
  cleanCache();const cached=cache.get(key);if(cached)return {...cached.value,cached:true};
  if(clock()<blockedUntil)throw Error('経路サービスが混雑しています。しばらく待って再度お試しください。');
  attempts=attempts.filter(t=>clock()-t<86400000);
  if(attempts.length>=120||attempts.filter(t=>clock()-t<3600000).length>=30)throw Error(`${localPrototype?'ローカル':'公開'}試用の経路取得上限に達しました（30回/時・120回/日）。`);
  await wait(Math.max(0,1100-(clock()-last)));last=clock();attempts.push(last);
  const url=new URL(`${origin.lon},${origin.lat};${entrance.lon},${entrance.lat}`,endpoint);
  url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'true',alternatives:'false',radiuses:`${MAX_ROAD_SNAP_METERS};${MAX_ROAD_SNAP_METERS}`,generate_hints:'false'}).toString();
  const release=await gate?.acquire();let result;
  try{
   let response;
   try{response=await fetchImpl(url,{headers:{'User-Agent':`Maniau${localPrototype?'Local':''}Prototype/0.3${validEmail?' (contact: '+contactEmail+')':''}`,'Referer':new URL('/',appOrigin).href},signal:AbortSignal.timeout(20000)});}catch{blockedUntil=clock()+30000;await gate?.backoff(30000);throw Error('徒歩経路の取得に失敗しました。通信状態を確認してください。');}
   if(!response.ok&&(response.status===429||response.status>=500)){await cancelBody(response);const delay=response.status===429?60000:30000;blockedUntil=clock()+delay;await gate?.backoff(delay);throw Error(`徒歩経路サービスに接続できませんでした（HTTP ${response.status}）。`);}
   let data;try{data=await readWalkingJson(response);}catch(error){if(error instanceof ResponseLimitError)throw error;if(response.ok)throw Error('徒歩経路サービスの応答を読み取れませんでした。');}
   if(!response.ok)throw Error(providerError(data?.code)||`徒歩経路サービスが検索を受け付けませんでした（HTTP ${response.status}）。`);
   result={...parseWalkingResponse(data,origin,entrance),kind:'route',entranceId:entrance.id,origin,fetchedAt:clock(),provider:config.provider,cached:false};
  }finally{await release?.();}
  remember(key,result);
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
  if(inflight.size>=MAX_PENDING_ROUTES)throw Error('徒歩経路の検索が混み合っています。少し待って更新してください。');
  const task=queue.then(()=>acquire(origin,entrance,key));queue=task.then(()=>{},()=>{});inflight.set(key,task);
  try{return await task;}finally{inflight.delete(key);}
 }
 return {route,config};
}
export async function loadWalkingService(env=process.env){
 const entrances=JSON.parse(await readFile(new URL('../src/data/entrances.json',import.meta.url),'utf8'));
 return createWalkingService({entrances,contactEmail:env.ROUTING_CONTACT_EMAIL??'',baseUrl:env.ROUTING_FOOT_URL||DEFAULT_URL});
}
