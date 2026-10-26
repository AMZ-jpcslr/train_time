import{describe,it,expect}from'vitest';
import entrances from'../src/data/entrances.json';
import{stations}from'../src/data/stations';
import{distanceKm}from'../src/domain/journey';
import addedKobe from'../src/data/kobe-expanded-stations.json';
import addedKaigan from'../src/data/kobe-kaigan-stations.json';
describe('reviewed station entrance catalogue',()=>{
 it('preserves reviewed entrances for the original eleven stations',()=>{const originalIds=new Set(entrances.map(e=>e.stationId));const original=stations.filter(s=>originalIds.has(s.id));expect(original).toHaveLength(11);expect(entrances).toHaveLength(22);expect(new Set(entrances.map(e=>e.id)).size).toBe(22);for(const s of original){const points=entrances.filter(e=>e.stationId===s.id);expect(points.length).toBeGreaterThan(0);for(const e of points){expect(distanceKm(s,e)).toBeLessThan(.5);expect(e.sourceUrl).toMatch(/^https:\/\//);expect(Number.isFinite(Date.parse(e.checkedAt))).toBe(true);expect(e.lat===s.lat&&e.lon===s.lon).toBe(false);}}});
 it('does not invent entrances for newly connected Kobe station centres',()=>{for(const s of [...addedKobe,...addedKaigan])expect(entrances.filter(e=>e.stationId===s.id)).toHaveLength(0);});
 it('does not turn new station centres into unverified entrances',()=>{expect(entrances.some(e=>e.stationId.startsWith('odpt-'))).toBe(false);});
 it('keeps explicitly restricted temporary/time-limited exits out of the catalogue',()=>{expect(entrances.find(e=>e.id==='osm-7627898595')).toBeUndefined();expect(entrances.find(e=>e.id==='ekitan-gakuentoshi-3249')).toBeUndefined();expect(entrances.find(e=>e.id==='ekitan-gakuentoshi-3060')).toBeUndefined();expect(entrances.filter(e=>e.stationId==='kobe-gakuentoshi').map(e=>e.name)).toEqual(['北出口','南出口']);});
});
