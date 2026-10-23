import type {Entrance, Position, SavedPlace, Settings, Station, Timetable, WalkingRoute} from './types';
import {addDays, availability, serviceDate, upcoming} from './time';
import {positionStatus, routeMinutes} from './journey';
import {needsAccessCheck,validWalkingRoute} from './routing';

export const widgetDepartureId=(d:{epoch:number;destination:string;trainType:string|null;platform:string|null})=>JSON.stringify([d.epoch,d.destination,d.trainType,d.platform]);
export interface WidgetSnapshot {
 schemaVersion:1; generatedAt:number; stationName:string; directionName:string; serviceDate:string;
 timetableValidUntil:number; walkingValidUntil:number|null; originLabel:string; walkMinutes:number|null;
 stationMinutes:number; speedKmh:number; routingTarget:{stationId:string;entranceId:string}|null;
 routeUpdatedAt:number|null; selectedDepartureId:string|null;
 departures:{id:string;departureAt:number;time:string;destination:string;trainType:string|null;platform:string|null}[];
}
export interface WidgetInput {
 now:number; preview:boolean; station:Station; directionName:string; table?:Timetable;
 settings:Settings; position:Position|null; route?:WalkingRoute; entrance?:Entrance;
 place?:SavedPlace; selectedId?:string;
}
/** The bridge sends only display facts and an entrance ID, never the user's coordinates. */
export function buildWidgetSnapshot(input:WidgetInput):WidgetSnapshot|null {
 const {now,table,station,settings,position,route,entrance,place}=input;
 const day=serviceDate(now);
 if(input.preview||!table||availability(table,day,now)!=='ready'||table.stationId!==station.id)return null;
 if(!Number.isFinite(settings.stationMinutes)||settings.stationMinutes<0||settings.stationMinutes>60||!Number.isFinite(settings.speedKmh)||settings.speedKmh<1||settings.speedKmh>6)return null;
 const ttl=station.id.startsWith('jr-')?6*3600000:30*86400000;
 const timetableValidUntil=Math.min(now+6*3600000,Date.parse(table.checkedAt)+ttl,Date.parse(addDays(day,1)+'T04:00:00+09:00'));
 if(!Number.isFinite(timetableValidUntil)||timetableValidUntil<=now)return null;
 const candidates=upcoming(table,day,now,Infinity).filter(d=>d.epoch<=timetableValidUntil);
 const chosen=input.selectedId?candidates.findIndex(d=>widgetDepartureId(d)===input.selectedId):0;
 // Never silently save a different train when the web timeline reaches beyond five.
 if(input.selectedId&&chosen<0)return null;
 const start=chosen>=5?chosen:0;
 const departures=candidates.slice(start,start+5).map(d=>({id:widgetDepartureId(d),departureAt:d.epoch,time:d.time,destination:d.destination,trainType:d.trainType,platform:d.platform}));
 if(!departures.length)return null;
 let walkMinutes:number|null=null,walkingValidUntil:number|null=null,routeUpdatedAt:number|null=null;
 if(place&&place.stationId===station.id&&Number.isFinite(place.walkMinutes)&&place.walkMinutes>=0&&place.walkMinutes<=240){
  walkMinutes=place.walkMinutes;walkingValidUntil=timetableValidUntil;
 }else if(!place&&position&&positionStatus(position,now)==='fresh'&&route&&entrance&&validWalkingRoute(route,entrance.id)&&Math.abs(route.origin.lat-position.lat)<=0.000001&&Math.abs(route.origin.lon-position.lon)<=0.000001&&route.fetchedAt<=now+30000&&!needsAccessCheck(route)){
  const expiry=Math.min(position.timestamp+5*60000,route.fetchedAt+10*60000,timetableValidUntil);
  if(expiry>now){const minutes=routeMinutes(route,settings.speedKmh);if(minutes!==null&&minutes<=240){walkMinutes=minutes;walkingValidUntil=expiry;routeUpdatedAt=route.fetchedAt;}}
 }
 const snapshot:WidgetSnapshot={schemaVersion:1,generatedAt:now,stationName:station.name,directionName:input.directionName,serviceDate:day,timetableValidUntil,walkingValidUntil,originLabel:place?place.name:'現在地',walkMinutes,stationMinutes:settings.stationMinutes,speedKmh:settings.speedKmh,routingTarget:!place&&entrance?.stationId===station.id?{stationId:station.id,entranceId:entrance.id}:null,routeUpdatedAt,selectedDepartureId:departures.some(d=>d.id===input.selectedId)?input.selectedId!:departures[0].id,departures};
 return new TextEncoder().encode(JSON.stringify(snapshot)).length<=32768?snapshot:null;
}
