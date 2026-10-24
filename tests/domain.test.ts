import { describe,expect,it,vi,afterEach } from 'vitest';
import {availability,dayType,departureEpoch,selectTable,serviceDate,upcoming,timeMinutes} from '../src/domain/time';
import {judge,geolocationError,positionStatus,distanceKm} from '../src/domain/journey';
import {load,save} from '../src/domain/storage';
import data from '../src/data/municipal.json';
import type {Timetable} from '../src/domain/types';
const tables=data as Timetable[];
const now=Date.parse('2026-10-22T12:00:00+09:00');
const table=tables.find(t=>t.stationId==='kobe-gakuentoshi'&&t.directionId==='east'&&t.dayType==='weekday')!;
const settings={stationMinutes:3,speedKmh:4.8};
describe('Japan calendar and service days',()=>{
 it('keeps post-midnight trains on their preceding service date',()=>{expect(serviceDate(Date.parse('2026-10-23T00:30:00+09:00'))).toBe('2026-10-22');expect(departureEpoch('2026-10-22','24:50')).toBe(Date.parse('2026-10-23T00:50:00+09:00'));});
 it('switches service day exactly at 04:00 JST regardless of OS zone',()=>{expect(serviceDate(Date.parse('2026-10-22T18:59:59Z'))).toBe('2026-10-22');expect(serviceDate(Date.parse('2026-10-22T19:00:00Z'))).toBe('2026-10-23');});
 it('uses national holidays including substitute and citizen holidays',()=>{expect(dayType('2026-11-03')).toBe('holiday');expect(dayType('2026-09-22')).toBe('holiday');expect(dayType('2026-05-06')).toBe('holiday');expect(dayType('2026-10-24')).toBe('saturday');expect(dayType('2026-10-22')).toBe('weekday');expect(dayType('2028-11-03')).toBeNull();});
 it('selects weekends for a holiday and keeps previous Friday after midnight',()=>{expect(selectTable(tables,table.stationId,'east','2026-11-03')?.dayType).toBe('weekend');const day=serviceDate(Date.parse('2026-10-24T00:10:00+09:00'));expect(selectTable(tables,table.stationId,'east',day)?.dayType).toBe('weekday');});
 it('does not generalize date-specific JR-like data to another day',()=>{const dated={...table,serviceDates:['2026-10-22']};expect(selectTable([dated],table.stationId,'east','2026-10-23')).toBeUndefined();expect(availability(dated,'2026-10-23',now)).toBe('missing');});
 it('selects the applicable newest revision instead of an old or future table',()=>{const old={...table,id:'old',validFrom:'2025-01-01',validTo:'2026-10-01'};const current={...table,id:'current',validFrom:'2026-10-02'};const future={...table,id:'future',validFrom:'2027-01-01'};expect(selectTable([old,future,current],table.stationId,'east','2026-10-22')?.id).toBe('current');});
 it('returns unknown-calendar information instead of falsely marking a weekday',()=>{const selected=selectTable(tables,table.stationId,'east','2028-04-05');expect(availability(selected,'2028-04-05',now)).toBe('calendar-unknown');});
 it('rejects invalid service times',()=>{for(const time of ['28:00','24:61','-1:00','9:00'])expect(()=>timeMinutes(time)).toThrow();});
});
describe('source availability and departure list',()=>{
 it('returns no invented departures for missing data',()=>expect(availability(undefined,'2026-10-22',now)).toBe('missing'));
 it('checks source validity and the separate freshness policy',()=>{expect(availability({...table,validTo:'2026-10-21'},'2026-10-22',now)).toBe('expired');expect(availability({...table,validFrom:'2026-10-23'},'2026-10-22',now)).toBe('expired');expect(availability({...table,checkedAt:'2026-09-01T00:00:00Z'},'2026-10-22',now)).toBe('expired');});
 it('expires authenticated challenge tables after six hours while retaining the existing bundled policy',()=>{const checkedAt=new Date(now-6*3600000-1).toISOString();expect(availability({...table,stationId:'challenge-test',checkedAt},'2026-10-22',now)).toBe('expired');expect(availability({...table,checkedAt},'2026-10-22',now)).toBe('ready');});
 it('blocks unverified and special-date data',()=>{expect(availability({...table,verification:'partial'},'2026-10-22',now)).toBe('unverified');expect(availability(table,'2026-12-31',now)).toBe('special');expect(availability({...table,excludedDates:['2026-10-22']},'2026-10-22',now)).toBe('special');});
 it('checks all calendar boundaries without treating unknown as weekday',()=>expect(availability(table,'2028-04-05',now)).toBe('calendar-unknown'));
 it('finds next real departures and excludes trains at and before now',()=>{expect(upcoming(table,'2026-10-22',now)[0]).toMatchObject({time:'12:06',destination:'新神戸'});expect(upcoming(table,'2026-10-22',departureEpoch('2026-10-22','12:06'))[0].time).not.toBe('12:06');});
 it('handles last train, 24h display, and end of service',()=>{expect(upcoming(table,'2026-10-22',Date.parse('2026-10-23T00:49:59+09:00'))[0]).toMatchObject({time:'24:50',destination:'名谷'});expect(upcoming(table,'2026-10-22',Date.parse('2026-10-23T01:00:00+09:00'))).toEqual([]);});
});
describe('walking judgment never claims unsupported routing',()=>{
 it('deducts only walking and the combined station time',()=>{expect(judge(now+20*60000,now,{kind:'measured',minutes:8},settings)).toMatchObject({slack:9,status:'comfortable'});expect(judge(now+13*60000,now,{kind:'measured',minutes:8},settings)).toMatchObject({slack:2,status:'tight'});});
 it('does not round negative seconds to catchable zero minutes',()=>{expect(judge(now+11*60000-1,now,{kind:'measured',minutes:8},settings).status).toBe('miss');expect(judge(now+11*60000,now,{kind:'measured',minutes:8},settings).status).toBe('tight');});
 it('handles seconds before departure',()=>expect(judge(now+1000,now,{kind:'measured',minutes:8},settings).status).toBe('miss'));
 it('marks estimates, failed routes, and missing routes unavailable',()=>{for(const walk of [{kind:'estimate',minutes:1},{kind:'failed'},{kind:'unavailable'}] as const)expect(judge(now+30*60000,now,walk,settings).label).toBe('判定不可');});
 it('rejects malformed numbers and negative station time',()=>{expect(judge(now,now,{kind:'measured',minutes:NaN},settings).status).toBe('unknown');expect(judge(now,now,{kind:'measured',minutes:8},{...settings,stationMinutes:-1}).status).toBe('unknown');});
 it('distinguishes refusal, stale and inaccurate GPS',()=>{expect(geolocationError(1)).toContain('拒否');const p={lat:34,lon:135,accuracy:10,timestamp:now};expect(positionStatus(p,now)).toBe('fresh');expect(positionStatus({...p,accuracy:500},now)).toBe('inaccurate');expect(positionStatus(p,now+301000)).toBe('stale');expect(positionStatus(null,now)).toBe('missing');});
 it('uses distance only as a straight line ranking',()=>{expect(distanceKm({lat:35,lon:135},{lat:35,lon:135})).toBe(0);expect(distanceKm({lat:35,lon:135},{lat:36,lon:135})).toBeCloseTo(111.195,2);});
});
describe('resilient local storage',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('recovers malformed storage and reports quota denial',()=>{vi.stubGlobal('localStorage',{getItem:()=>'{',setItem:()=>{throw new Error('blocked');}});expect(load().places).toEqual([]);expect(save(load())).toBe(false);});
 it('rejects invalid walking times imported from local storage',()=>{vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({places:[{id:'x',name:'home',stationId:'s',entrance:'north',walkMinutes:-3}],favorites:[],settings:{stationMinutes:-1}})});expect(load().places).toEqual([]);expect(load().settings.stationMinutes).toBe(3);});
});
