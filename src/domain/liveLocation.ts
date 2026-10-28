import type {Position} from './types';
import {distanceKm,validPosition} from './journey';
export const LIVE_MAX_AGE=45_000;
export const LIVE_MAX_ACCURACY=50;
export function liveQuality(position:Position|null,now:number){
 if(!position)return 'missing';
 if(!validPosition(position,now))return 'invalid';
 if(now-position.timestamp>LIVE_MAX_AGE)return 'stale';
 return position.accuracy>LIVE_MAX_ACCURACY?'inaccurate':'fresh';
}
/** Re-route at most every 15s while moving, every 30s while stationary. */
export function shouldRoute(previous:Position|null,next:Position){
 if(!previous)return true;
 const elapsed=next.timestamp-previous.timestamp;
 return elapsed>=30_000||(elapsed>=15_000&&distanceKm(previous,next)*1000>=30);
}
export type ArrivalEvidence={since:number;count:number;last:number;near:boolean};
export const noArrival:ArrivalEvidence={since:0,count:0,last:0,near:false};
/** An entrance vicinity estimate, never evidence of boarding or platform arrival. */
export function arrivalEvidence(previous:ArrivalEvidence,sample:Position,target:{lat:number;lon:number},now:number):ArrivalEvidence{
 if(liveQuality(sample,now)!=='fresh'||sample.accuracy>20||distanceKm(sample,target)*1000+sample.accuracy>45)return {...noArrival};
 if(sample.timestamp<=previous.last)return previous;
 const count=previous.count+1,since=previous.count?previous.since:sample.timestamp;
 return {since,count,last:sample.timestamp,near:count>=3&&sample.timestamp-since>=8000};
}
export function subscribeLive(source:Pick<Geolocation,'watchPosition'|'clearWatch'>,onSample:(p:Position)=>void,onError:(code:number)=>void){
 let closed=false,id:number|undefined;
 const cancel=()=>{if(closed)return;closed=true;if(id!==undefined)source.clearWatch(id);};
 try{
  id=source.watchPosition(raw=>{if(!closed)onSample({lat:raw.coords.latitude,lon:raw.coords.longitude,accuracy:raw.coords.accuracy,timestamp:raw.timestamp});},error=>{if(closed)return;cancel();onError(error.code);},{enableHighAccuracy:true,maximumAge:0,timeout:20_000});
  if(closed)source.clearWatch(id);
 }catch{cancel();onError(2);}
 return cancel;
}
