import {describe,it,expect,vi} from 'vitest';
// @ts-expect-error Server-only public API adapter
import {createWesternService,westernStation} from '../server/western-service.mjs';
import {validWesternStation} from '../src/domain/westernStation';
import {validStationTables} from '../src/useStationTimetables';
import {availability} from '../src/domain/time';
import {searchStations} from '../src/domain/stationSearch';
const raw='scrape-hankyu:fictional-station',day='2026-10-25',date='20261025';
const detail={id:raw,feedId:'scrape-hankyu',name:'試験十三',lat:34.72,lon:135.48,routes:[{name:'試験神戸線',mode:'rail'}]};
const station=westernStation(detail),now=Date.parse('2026-10-25T12:00:00+09:00');
const departure=(n:number,seconds=14400+n*60)=>({routeName:'試験神戸線',mode:'rail',tripId:'fictional-'+n,stopId:raw,headsign:'試験行先',departureSecs:seconds,headwayBased:false});
const response=(departures:unknown[],override={})=>Response.json({stationId:raw,date,timezone:'Asia/Tokyo',departures,...override});
describe('western public API integration',()=>{
 it('pages inclusively, deduplicates boundary trains and marks all results reference-only',async()=>{
  let pages=0;const fetchImpl=vi.fn(async(url:string)=>url.includes('/departures?')?response(++pages===1?Array.from({length:100},(_,i)=>departure(i)):[departure(99),departure(100)]):Response.json(detail));
  const s=createWesternService({local:true,fetchImpl,clock:()=>now,delay:async()=>{}}),tables=await s.timetable(station.id,day);
  expect(tables[0].departures).toHaveLength(101);expect(tables[0].departures.at(-1).time).toBe('05:40:00');expect(tables[0].serviceDates).toEqual([day]);
  expect(validWesternStation(station)).toBe(true);expect(validStationTables(tables,station)).toBe(true);expect(availability(tables[0],day,now)).toBe('unverified');
  expect(availability(tables[0],day,now+3600001)).toBe('expired');expect(validStationTables([{...tables[0],verification:'verified'}],station)).toBe(false);
  await s.timetable(station.id,day);expect(fetchImpl).toHaveBeenCalledTimes(3);expect(fetchImpl.mock.calls[2][0]).toContain('time=05:39:00');
 });
 it('rejects forged station ids and invalid dates before making requests',async()=>{
  const fetchImpl=vi.fn(),s=createWesternService({local:true,fetchImpl});
  for(const id of ['western-'+Buffer.from('other:station').toString('base64url'),'western-'+Buffer.from('scrape-hankyu:../other').toString('base64url')])await expect(s.timetable(id,day)).rejects.toThrow('識別子');
  await expect(s.timetable(station.id,'2026-02-31')).rejects.toThrow('運行日');expect(fetchImpl).not.toHaveBeenCalled();
  await expect(createWesternService({fetchImpl}).search('十三')).rejects.toThrow('共有キャッシュ');expect(fetchImpl).not.toHaveBeenCalled();
 });
 it('rejects mismatched upstream dates and never invents trains for empty service',async()=>{
  for(const board of [response([departure(0)],{date:'20261024'}),response([])]){
   const s=createWesternService({local:true,fetchImpl:async(url:string)=>url.includes('/departures?')?board:Response.json(detail),clock:()=>now,delay:async()=>{}});
   await expect(s.timetable(station.id,day)).rejects.toThrow(/運行日|収録/);
  }
 });
 it('filters by operator, resolves real route metadata and bounds search results',async()=>{
  const fetchImpl=vi.fn(async(url:string)=>url.includes('suggest?')?Response.json({stations:[{id:raw,feedId:'scrape-hankyu'},{id:'unrelated:x',feedId:'unrelated'}]}):Response.json(detail));
  const s=createWesternService({local:true,fetchImpl,clock:()=>now,delay:async()=>{}}),result=await s.search('阪急 十三');
  expect(result.stations).toEqual([station]);expect(fetchImpl.mock.calls[0][0]).toContain('q='+encodeURIComponent('十三'));
  expect(searchStations(result.stations,'阪急試験十三')).toEqual([station]);expect(searchStations(result.stations,'阪急電鉄試験十三')).toEqual([station]);
  expect(validWesternStation({...station,sourceUrl:'https://evil.example/'})).toBe(false);await s.search('阪急 十三');expect(fetchImpl).toHaveBeenCalledTimes(2);
 });
 it('retains actual Hanshin departure times with an explicit unknown destination instead of dropping them',async()=>{
  const row={...departure(0),headsign:undefined};
  const s=createWesternService({local:true,clock:()=>now,delay:async()=>{},fetchImpl:async(url:string)=>url.includes('/departures?')?response([row]):Response.json(detail)});
  const [table]=await s.timetable(station.id,day);expect(table.departures[0].time).toBe('04:00:00');expect(table.departures[0].destination).toBe('行先未収録');expect(table.verification).toBe('partial');
 });
});
