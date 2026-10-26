import {describe,expect,it} from 'vitest';
import manifest from '../src/data/jr-scope.json';
import tables from '../src/data/jr.json';
import evidence from '../docs/jr-validation.json';
import {JR_SCOPE,JR_STATIONS,JR_DIRECTIONS,expectedJrDirectionKeys,matchesJrDirection,validateJrScope,isJrAcquisitionStation} from '../src/domain/jr-scope.mjs';
import {validDailyResult,JR_DAILY_TTL_MS} from '../src/useTimetables';
// @ts-expect-error Node-only collector intentionally consumes the same native ES module.
import {JR_STATIONS as collectorStations} from '../scripts/import-jr.mjs';
// @ts-expect-error Native Node service shares the same direction contract.
import {validateResult} from '../server/jr-service.mjs';

describe('declared JR company and corridor scope',()=>{
 it('only acquires declared stations, not searchable catalog entries or JR-prefixed unknown IDs',()=>{
  for(const station of JR_STATIONS)expect(isJrAcquisitionStation(station.id)).toBe(true);
  for(const id of ['jr-catalog-1130301-kobe','jr-new-station','jr-osaka-east','jr-','hankyu-osaka',''])expect(isJrAcquisitionStation(id)).toBe(false);
 });
 it('retains the existing four stations and all eight acquired directions without widening collection',()=>{
  expect(JR_STATIONS.map(s=>[s.id,s.eid])).toEqual([['jr-nishinomiya','0610136'],['jr-osaka','0610130'],['jr-ibaraki','0610124'],['jr-minamikusatsu','0610149']]);
  expect(JR_DIRECTIONS).toHaveLength(8);expect(collectorStations).toBe(JR_STATIONS);
  const acquired=tables.filter(t=>t.serviceDates[0]==='2026-10-22');
  expect(new Set(acquired.map(t=>`${t.stationId}-${t.directionId}`))).toEqual(expectedJrDirectionKeys());
  expect(acquired.every(matchesJrDirection)).toBe(true);expect(acquired.reduce((n,t)=>n+t.departures.length,0)).toBe(1702);
  expect(JR_SCOPE.scopeVersion).toBe(2);expect(JR_SCOPE.reusePermission).toBe('unresolved-existing');
 });
 it('does not let response validation mutate the declared coverage',()=>{
  const keys=expectedJrDirectionKeys();keys.clear();expect(expectedJrDirectionKeys().size).toBe(8);
  expect(Object.isFrozen(JR_SCOPE.stations[0].routes[0])).toBe(true);
  expect(Object.isFrozen(JR_STATIONS[0].routes[0])).toBe(true);
 });
 it.each([
  ['empty stations',(v:typeof manifest)=>{v.stations=[];}],
  ['duplicate station',(v:typeof manifest)=>{v.stations.push(structuredClone(v.stations[0]));}],
  ['duplicate EID',(v:typeof manifest)=>{v.stations[1].eid=v.stations[0].eid;}],
  ['duplicate direction',(v:typeof manifest)=>{v.stations[0].routes.push(structuredClone(v.stations[0].routes[0]));}],
  ['unknown corridor',(v:typeof manifest)=>{v.stations[0].routes[0].corridorId='unknown';}],
  ['wrong source line',(v:typeof manifest)=>{v.stations[0].routes[0].sourceLine='別の路線';}],
  ['unsafe EID',(v:typeof manifest)=>{v.stations[0].eid='123&x=1';}],
  ['different source',(v:typeof manifest)=>{v.sourceOrigin='https://example.test';}],
  ['pending scope',(v:typeof manifest)=>{v.acquisitionScope='pending';}],
  ['permission flag',(v:typeof manifest)=>{v.reusePermission='approved';}],
  ['missing quality review',(v:typeof manifest)=>{v.qualityReview='';}],
 ])('fails closed for %s',(_name,mutate)=>{
  const value=structuredClone(manifest);mutate(value);expect(()=>validateJrScope(value)).toThrow();
 });
 it('does not silently ignore station-level flags or alternate acquisition URLs',()=>{
  const pending=structuredClone(manifest);Object.assign(pending.stations[0],{acquisitionScope:'pending'});expect(()=>validateJrScope(pending)).toThrow();
  const injected=structuredClone(manifest);Object.assign(injected.stations[0],{sourceUrl:'https://example.test'});expect(()=>validateJrScope(injected)).toThrow();
 });
 it('requires declared station, direction, operator and line even when the response has eight tables',()=>{
  const day='2026-10-22',base=tables.filter(t=>t.serviceDates[0]===day),oldest=Math.min(...base.map(t=>Date.parse(t.retrievedAt)));
  const fixture=()=>({schemaVersion:2,serviceDate:day,status:'ready',tables:structuredClone(base),expiresAt:new Date(oldest+JR_DAILY_TTL_MS).toISOString(),errors:[]});
  expect(validDailyResult(fixture(),day)).toBe(true);
  for(const field of ['stationId','directionId','operator','line','direction'] as const){const value=fixture();value.tables[0][field]='unknown';expect(validDailyResult(value,day)).toBe(false);}
  const extra=fixture();extra.tables.push(structuredClone(extra.tables[0]));expect(validDailyResult(extra,day)).toBe(false);
  const missing=fixture();missing.tables.pop();expect(validDailyResult(missing,day)).toBe(false);
 });
 it('also rejects mislabeled identity at the server boundary with otherwise intact acquired evidence',()=>{
  const day='2026-10-22',dayTables=tables.filter(t=>t.serviceDates[0]===day),ids=new Set(dayTables.map(t=>t.id));
  const value={tables:structuredClone(dayTables),evidence:evidence.filter(item=>ids.has(item.id))};
  expect(()=>validateResult(day,value)).not.toThrow();
  value.tables[0].direction='別路線方面';
  expect(()=>validateResult(day,value)).toThrow('scope mismatch');
 });
});
