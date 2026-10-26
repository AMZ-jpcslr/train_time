import { describe, expect, it } from 'vitest';
// @ts-expect-error native Node ESM importer shared with offline tests
import { validateNetwork, stationDepartures, stationVariants, OFFICIAL_REVIEWED_AT } from '../scripts/import-kobe-expanded.mjs';
import stationData from '../src/data/kobe-expanded-stations.json';
import tableData from '../src/data/kobe-expanded.json';
import evidence from '../docs/kobe-expansion-20261026-validation.json';
import { availability, departureEpoch, selectTable, serviceDate, upcoming } from '../src/domain/time';
import type { Timetable } from '../src/domain/types';

const tables = tableData as Timetable[];
const fixture = '始発駅,西神中央,名谷\n行先駅,谷上,新神戸\n西神中央,23:50,\n名谷,0:02,0:03\n新神戸,0:25,0:27\n谷上,0:33,\n';
describe('Kobe expanded bulk importer', () => {
  it('retains partial runs and excludes terminal arrivals including midnight', () => {
    const rows = validateNetwork(fixture);
    expect(stationDepartures(rows,'新神戸').departures).toEqual([{time:'24:25',destination:'谷上',trainType:null,platform:null}]);
    expect(stationDepartures(rows,'新神戸').excludedArrivalColumns).toEqual([3]);
    expect(stationDepartures(rows,'谷上').departures).toEqual([]);
    expect(stationDepartures(rows,'名谷').departures.map((d: {time:string})=>d.time)).toEqual(['24:02','24:03']);
  });
  it.each([
    ['missing intermediate stop', fixture.replace('名谷,0:02,0:03','名谷,,0:03')],
    ['time outside route', fixture.replace('西神中央,23:50,','西神中央,23:50,23:51')],
    ['reversed train',fixture.replace('行先駅,谷上,新神戸','行先駅,谷上,西神中央')],
    ['duplicate station',fixture.replace('谷上,0:33,','新神戸,0:33,')],
    ['backwards time',fixture.replace('谷上,0:33,','谷上,0:20,')],
    ['malformed columns',fixture.replace('谷上,0:33,','谷上,0:33')],
  ])('rejects %s instead of inventing a stop', (_, csv) => expect(()=>validateNetwork(csv)).toThrow());
  it('rejects duplicate departures and unknown station requests',()=>{
    const rows = validateNetwork('始発駅,a,a\n行先駅,b,b\na,5:00,5:00\nb,5:10,5:10');
    expect(()=>stationDepartures(rows,'a')).toThrow('Duplicate');
    expect(()=>stationDepartures(rows,'missing')).toThrow('Missing');
  });
  it('splits Shin-Kobe by departing line, without duplicated trains',()=>{
    expect(stationVariants('新神戸','S02').map((s: {directions:string[]})=>s.directions)).toEqual([['west'],['east']]);
    const shinkobe = stationData.filter(s=>s.name==='新神戸');
    expect(shinkobe).toHaveLength(2);
    expect(new Set(shinkobe.map(s=>s.physicalStationId)).size).toBe(1);
    expect(tables.filter(t=>t.stationId.startsWith('kobe-s02'))).toHaveLength(4);
    expect(stationData.find(s=>s.code==='S01')?.directions.map(d=>d.id)).toEqual(['west']);
    expect(stationData.find(s=>s.code==='S17')?.directions.map(d=>d.id)).toEqual(['east']);
  });
});

describe('reviewed Kobe expansion evidence',()=>{
  it('connects 16 station-lines, 15 additional physical stations, and 56 tables',()=>{
    expect(stationData).toHaveLength(16);
    expect(new Set(stationData.map(s=>s.physicalStationId)).size).toBe(15);
    expect(tables).toHaveLength(56);
    expect(tables.reduce((n,t)=>n+t.departures.length,0)).toBe(8882);
    expect(new Set(tables.map(t=>t.id)).size).toBe(tables.length);
    for(const station of stationData) for(const direction of station.directions) {
      expect(tables.filter(t=>t.stationId===station.id&&t.directionId===direction.id).map(t=>t.dayType).sort()).toEqual(['weekday','weekend']);
    }
  });
  it('keeps evidence beyond verification flags and never renews review on cache parsing',()=>{
    expect(evidence.baselineMatches).toHaveLength(8);
    expect(evidence.baselineMatches.every(row=>row.exactMatch)).toBe(true);
    expect(evidence.samples).toHaveLength(13);
    expect(evidence.samples.every(row=>row.matched)).toBe(true);
    expect(evidence.sources).toHaveLength(4);
    for(const source of evidence.sources) expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    for(const t of tables) {
      expect(t.checkedAt).toBe(OFFICIAL_REVIEWED_AT);
      expect(t.revisionDate).toBe('2025-03-15');
      expect(t.validTo).toBeNull();
      expect(t.notes.join(' ')).toContain('全駅全便の別資料突合ではありません');
      expect(t.departures.every(d=>d.destination!==stationData.find(s=>s.id===t.stationId)?.name)).toBe(true);
    }
  });
  it('does not import the cached obsolete Kaigan timetable',()=>{
    expect(stationData.some(s=>s.line==='海岸線')).toBe(false);
    expect(tables.some(t=>t.line==='海岸線')).toBe(false);
  });
  it('honors holidays, expiry, revision boundary and actual post-midnight final departures',()=>{
    const weekday = selectTable(tables,'kobe-s15','west','2026-10-26')!;
    expect(weekday.dayType).toBe('weekday');
    expect(selectTable(tables,'kobe-s15','west','2026-11-03')?.dayType).toBe('weekend');
    expect(selectTable(tables,'kobe-s15','west','2026-10-24')?.dayType).toBe('weekend');
    expect(availability(weekday,'2025-03-14',Date.parse(weekday.checkedAt))).toBe('expired');
    expect(availability(weekday,'2026-12-31',Date.parse(weekday.checkedAt))).toBe('special');
    expect(availability({...weekday,checkedAt:'2026-08-01T00:00:00Z'},'2026-10-26',Date.parse('2026-10-26T12:00:00+09:00'))).toBe('expired');
    const final = departureEpoch('2026-10-26','25:01');
    expect(serviceDate(final)).toBe('2026-10-26');
    expect(upcoming(weekday,'2026-10-26',final-1)[0]?.time).toBe('25:01');
    expect(upcoming(weekday,'2026-10-26',final)).toEqual([]);
    expect(selectTable(tables,'kobe-s01','east','2026-10-26')).toBeUndefined();
  });
});
