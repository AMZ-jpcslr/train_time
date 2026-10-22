import {describe,it,expect} from 'vitest';
import {buildWidgetSnapshot,type WidgetInput} from '../src/domain/widget';
import {stations} from '../src/data/stations';
import municipal from '../src/data/municipal.json';
import entrances from '../src/data/entrances.json';
import {selectTable} from '../src/domain/time';
import type {Timetable} from '../src/domain/types';
const now=Date.parse('2026-10-22T14:00:00+09:00');
function fixture():WidgetInput {
 const station=stations.find(s=>s.id==='kobe-gakuentoshi')!,entrance=entrances.find(e=>e.stationId===station.id)!;
 const table=selectTable(municipal as Timetable[],station.id,station.directions[0].id,'2026-10-22')!;
 const position={lat:entrance.lat,lon:entrance.lon,accuracy:17,timestamp:now};
 return {now,preview:false,station,directionName:station.directions[0].name,table:{...table,checkedAt:new Date(now-60000).toISOString()},settings:{speedKmh:4.8,stationMinutes:3},position,entrance,route:{kind:'route',entranceId:entrance.id,origin:{lat:position.lat,lon:position.lon},distanceMeters:80,roadDistanceMeters:80,durationSeconds:60,snapDistances:[0,0],geometry:[[position.lon,position.lat],[entrance.lon,entrance.lat]],steps:[],fetchedAt:now,provider:'test',cached:false,dataVersion:null}};
}
describe('native snapshot boundaries',()=>{
 it('exports five departures and only a fresh coordinate-free route estimate',()=>{
  const data=buildWidgetSnapshot(fixture())!;expect(data.departures).toHaveLength(5);expect(data.walkMinutes).toBe(1);expect(data.walkingValidUntil).toBe(now+300000);expect(data.timetableValidUntil).toBe(now+6*3600000);
  expect(JSON.stringify(data)).not.toMatch(/"(?:lat|lon|latitude|longitude|bufferMinutes|geometry)"/);expect(data.routingTarget?.stationId).toBe('kobe-gakuentoshi');
 });
 it.each(['preview','missing','expired','unverified','after-last'] as const)('rejects %s timetable',kind=>{
  const input=fixture();if(kind==='preview')input.preview=true;if(kind==='missing')input.table=undefined;if(kind==='expired')input.table!.checkedAt='2020-01-01';if(kind==='unverified')input.table!.verification='partial';if(kind==='after-last')input.table!.departures=[];expect(buildWidgetSnapshot(input)).toBeNull();
 });
 it.each(['stale-gps','inaccurate','access-gap','old-route','future-route','different-origin','no-route'] as const)('withholds walking for %s',kind=>{
  const input=fixture();if(kind==='stale-gps')input.position!.timestamp-=300001;if(kind==='inaccurate')input.position!.accuracy=202;if(kind==='access-gap')input.route!.snapDistances=[31,0];if(kind==='old-route')input.route!.fetchedAt-=600001;if(kind==='future-route')input.route!.fetchedAt+=30001;if(kind==='different-origin')input.route!.origin.lat+=.01;if(kind==='no-route')input.route=undefined;
  const data=buildWidgetSnapshot(input)!;expect(data.walkMinutes).toBeNull();expect(data.walkingValidUntil).toBeNull();expect(data.departures.length).toBe(5);
 });
 it('measured places have no background routing target and last until timetable expiry',()=>{
  const input=fixture();input.position=null;input.place={id:'place',stationId:input.station.id,name:'テスト地点',entrance:'テスト入口',walkMinutes:8};const data=buildWidgetSnapshot(input)!;expect(data.walkMinutes).toBe(8);expect(data.walkingValidUntil).toBe(data.timetableValidUntil);expect(data.routingTarget).toBeNull();expect(data.routeUpdatedAt).toBeNull();
 });
 it('accepts server coordinate rounding to six decimal places',()=>{const input=fixture();input.position!.lat+=0.0000004;expect(buildWidgetSnapshot(input)!.walkMinutes).toBe(1);});
 it('caps snapshots at the next 04:00 and preserves 24-hour service times',()=>{
  const input=fixture();input.now=Date.parse('2026-10-23T00:00:00+09:00');input.table!.departures=[{time:'24:10',destination:'テスト',trainType:'普通',platform:null}];const data=buildWidgetSnapshot(input)!;expect(data.serviceDate).toBe('2026-10-22');expect(data.timetableValidUntil).toBe(Date.parse('2026-10-23T04:00:00+09:00'));expect(data.departures[0].departureAt).toBe(Date.parse('2026-10-23T00:10:00+09:00'));
 });
 it('does not revive a JR table older than six hours',()=>{const input=fixture();input.station={...input.station,id:'jr-ibaraki'};input.table={...input.table!,stationId:'jr-ibaraki',checkedAt:new Date(now-6*3600000-1).toISOString()};expect(buildWidgetSnapshot(input)).toBeNull();});
});
