import type {Entrance,Position,WalkingRoute} from './types';
export function validWalkingRoute(data:WalkingRoute,entranceId:string):boolean {
 return data?.kind==='route'&&data.entranceId===entranceId&&Number.isFinite(data.distanceMeters)&&data.distanceMeters>=0&&Number.isFinite(data.durationSeconds)&&data.durationSeconds>=0&&Number.isFinite(data.fetchedAt)&&Array.isArray(data.geometry)&&data.geometry.length>=2&&data.geometry.every(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
}
export async function requestWalking(position:Position,entrance:Entrance,signal?:AbortSignal):Promise<WalkingRoute>{
 const response=await fetch('/api/walking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:{lat:position.lat,lon:position.lon},entranceId:entrance.id,stationId:entrance.stationId}),signal});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'徒歩経路を取得できませんでした。');
 if(!validWalkingRoute(data,entrance.id))throw Error('経路の応答を検証できませんでした。');
 return data;
}
