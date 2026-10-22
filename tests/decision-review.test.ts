import {describe,it,expect} from 'vitest';
import {judge,leavingWindow,routeMinutes} from '../src/domain/journey';
import {availability,departureEpoch,serviceDate,upcoming,selectTable} from '../src/domain/time';
import {routeMatchesRequest} from '../src/domain/routing';
import type {Timetable,WalkingRoute} from '../src/domain/types';

// Synthetic fixtures. Every epoch is explicit JST; also run this suite under other host TZs.
const now=Date.parse('2026-10-23T23:58:00+09:00');
const settings={stationMinutes:3,speedKmh:4.8};
const table:Timetable={id:'synthetic',stationId:'test',operator:'test',line:'test',directionId:'east',direction:'test',dayType:'weekday',departures:['24:10','24:20','24:30'].map(time=>({time,destination:'試験駅',trainType:'普通',platform:null})),sourceUrl:'https://example.test',checkedAt:'2026-10-23T12:00:00+09:00',retrievedAt:'2026-10-23T12:00:00+09:00',validFrom:null,validTo:null,revisionDate:null,verification:'verified',notes:[]};
describe('departure decision review fixtures (Asia/Tokyo)',()=>{
 it.each([-1,0,1])('uses the same millisecond boundary for judgment and leave time: %i',offset=>{
  const departure=now+11*60000+offset;
  expect(judge(departure,now,{kind:'measured',minutes:8},settings).status).toBe(offset<0?'miss':'tight');
  expect(leavingWindow(departure,now,{kind:'measured',minutes:8},settings)?.remainingMs).toBe(offset);
 });
 it('crosses midnight into Saturday while retaining the Friday operating table',()=>{
  const time=Date.parse('2026-10-24T00:01:00+09:00');const day=serviceDate(time);
  const weekend={...table,id:'weekend',dayType:'weekend' as const};
  expect(day).toBe('2026-10-23');expect(selectTable([table,weekend],'test','east',day)?.id).toBe('synthetic');
  expect(departureEpoch(day,'24:10')).toBe(Date.parse('2026-10-24T00:10:00+09:00'));
  expect(selectTable([table,weekend],'test','east',serviceDate(Date.parse('2026-10-24T04:00:00+09:00')))?.id).toBe('weekend');
 });
 it.each([0,1,3,4,5])('keeps %i candidates without padding invented trains',count=>{
  const sample={...table,departures:Array.from({length:count},(_,i)=>({...table.departures[0],time:`24:${10+i*5}`}))};
  expect(upcoming(sample,'2026-10-23',now)).toHaveLength(count);
 });
 it('excludes the departed final train and never substitutes a missing direction',()=>{
  expect(upcoming(table,'2026-10-23',departureEpoch('2026-10-23','24:30'))).toEqual([]);
  expect(availability(selectTable([table],'test','west','2026-10-23'),'2026-10-23',now)).toBe('missing');
 });
 it('applies walking, station movement and included allowance exactly once',()=>{
  const departure=departureEpoch('2026-10-23','24:10');
  const baseline=leavingWindow(departure,now,{kind:'measured',minutes:5},settings)!;
  expect(baseline.remainingMs).toBe(4*60000);
  expect(leavingWindow(departure,now,{kind:'measured',minutes:6},settings)!.remainingMs).toBe(3*60000);
  expect(leavingWindow(departure,now,{kind:'measured',minutes:5},{...settings,stationMinutes:4})!.remainingMs).toBe(3*60000);
  expect(routeMinutes({durationSeconds:60,distanceMeters:80},1)).toBe(5);
 });
});
describe('route identity and clock boundary',()=>{
 const position={lat:35.030123456,lon:135.759123456,accuracy:10,timestamp:now};
 const route={origin:{lat:35.030123,lon:135.759123},fetchedAt:now} as WalkingRoute;
 it('accepts the server six-decimal rounding but rejects another origin',()=>{
  expect(routeMatchesRequest(route,position,now)).toBe(true);
  expect(routeMatchesRequest({...route,origin:{lat:34,lon:135}},position,now)).toBe(false);
 });
 it('rejects expired and future results including after clock rollback',()=>{
  expect(routeMatchesRequest({...route,fetchedAt:now-600000},position,now)).toBe(false);
  expect(routeMatchesRequest({...route,fetchedAt:now-599999},position,now)).toBe(true);
  expect(routeMatchesRequest({...route,fetchedAt:now+30001},position,now)).toBe(false);
  expect(routeMatchesRequest(route,position,now-3600000)).toBe(false);
 });
});
