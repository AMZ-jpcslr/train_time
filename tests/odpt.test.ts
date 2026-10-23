import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {stations} from '../src/data/stations';
import coverage from '../src/data/odpt-coverage.json';
import {searchStations} from '../src/domain/stationSearch';
import {availability,departureEpoch,selectTable} from '../src/domain/time';
import {validStationTables} from '../src/useStationTimetables';
import type {Timetable} from '../src/domain/types';
const added=stations.filter(s=>s.timetablePath);
const read=(s:typeof stations[number]):Timetable[]=>JSON.parse(readFileSync('public'+s.timetablePath,'utf8'));
describe('ODPT imported source integrity',()=>{
 it('ships exactly the indexed stations and no restricted Hakodate data',()=>{
  expect(added.length).toBe(225);expect(new Set(stations.map(s=>s.id)).size).toBe(stations.length);
  expect(readdirSync('public/data/odpt').sort()).toEqual(added.map(s=>s.timetablePath!.split('/').at(-1)).sort());
  expect(added.some(s=>s.id.includes('hakodate'))).toBe(false);
  expect(coverage.find(p=>p.id==='hakodate')?.status).toBe('approval-required');
 });
 it('validates every station file, covers both operators and never overlaps date/direction tables',()=>{
  for(const s of added){
   const tables=read(s);expect(validStationTables(tables,s),s.name).toBe(true);
   const covered=new Set<string>();
   for(const t of tables){
    expect(t.serviceDates?.length).toBeGreaterThan(0);
    for(const day of t.serviceDates!){const key=t.directionId+'/'+day;expect(covered.has(key),key).toBe(false);covered.add(key);}
    expect(t.validFrom).toBe(t.serviceDates![0]);expect(t.validTo).toBe(t.serviceDates!.at(-1));
   }
  }
 });
 it('matches source CSV samples and holiday exceptions without inventing service outside the feed',()=>{
  const s=added.find(s=>s.name==='西馬込')!,tables=read(s),did=s.directions[0].id;
  const weekday=selectTable(tables,s.id,did,'2026-10-23')!,holiday=selectTable(tables,s.id,did,'2026-11-03')!;
  expect(weekday.departures[0]).toMatchObject({time:'05:00',destination:'印旛日本医大'});
  expect(weekday.departures[1]).toMatchObject({time:'05:08',destination:'京成高砂'});
  expect(holiday.departures[1]).toMatchObject({time:'05:07',destination:'青砥'});
  expect(selectTable(tables,s.id,did,'2027-03-13')).toBeUndefined();
  expect(availability(weekday,'2026-10-23',Date.parse(weekday.checkedAt)+31*86400000)).toBe('expired');
 });
 it('retains half-minute GTFS departures and through services at operator boundaries',()=>{
  const s=added.find(s=>s.name==='鴨部')!;
  expect(read(s).some(t=>t.departures.some(d=>d.time==='05:52:30'))).toBe(true);
  expect(departureEpoch('2026-10-23','05:52:30')).toBe(Date.parse('2026-10-23T05:52:30+09:00'));
  const boundary=added.find(s=>s.name==='泉岳寺')!;
  const direction=boundary.directions.find(d=>d.name==='他社線への直通方面')!;
  expect(selectTable(read(boundary),boundary.id,direction.id,'2026-10-23')?.departures.some(d=>d.destination==='羽田空港')).toBe(true);
 });
 it('rejects an unrelated or malformed station response',()=>{
  const s=added[0],data=read(s);
  expect(validStationTables(data,added[1])).toBe(false);
  expect(validStationTables([{...data[0],departures:[{...data[0].departures[0],time:'25:99'}]}],s)).toBe(false);
 });
});
describe('station discovery',()=>{
 it('is search-first, normalizes full-width/kana and supports compound operator/line searches',()=>{
  expect(searchStations(stations,'')).toEqual([]);
  expect(searchStations(stations,'ＪＲ茨木')[0].id).toBe('jr-ibaraki');
  expect(searchStations(stations,'東京都交通局 浅草線').length).toBeGreaterThan(10);
  expect(searchStations(stations,'かもべ').some(s=>s.name==='鴨部')).toBe(true);
  expect(searchStations(stations,'カモベ').some(s=>s.name==='鴨部')).toBe(true);
  expect(searchStations(stations,'存在しない駅')).toEqual([]);
 });
});
