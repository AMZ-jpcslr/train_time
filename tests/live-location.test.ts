import {describe,it,expect,vi} from 'vitest';
import {liveQuality,shouldRoute,arrivalEvidence,noArrival,subscribeLive} from '../src/domain/liveLocation';
const now=Date.parse('2026-10-27T14:00:00+09:00'),point={lat:35,lon:135,accuracy:10,timestamp:now};
describe('live location quality and routing',()=>{
 it('rejects inaccurate, stale and malformed fixes',()=>{
  expect(liveQuality(point,now)).toBe('fresh');expect(liveQuality({...point,accuracy:51},now)).toBe('inaccurate');expect(liveQuality(point,now+45001)).toBe('stale');expect(liveQuality({...point,lat:NaN},now)).toBe('invalid');
 });
 it('bounds route refreshes without inventing movement',()=>{
  expect(shouldRoute(null,point)).toBe(true);expect(shouldRoute(point,{...point,timestamp:now+14000,lat:35.001})).toBe(false);expect(shouldRoute(point,{...point,timestamp:now+15000,lat:35.001})).toBe(true);expect(shouldRoute(point,{...point,timestamp:now+29999})).toBe(false);expect(shouldRoute(point,{...point,timestamp:now+30000})).toBe(true);
 });
 it('requires independent, accurate entrance fixes over time',()=>{
  const a=arrivalEvidence(noArrival,point,point,now),b=arrivalEvidence(a,{...point,timestamp:now+4000},point,now+4000),c=arrivalEvidence(b,{...point,timestamp:now+8000},point,now+8000);
  expect(a.near).toBe(false);expect(b.near).toBe(false);expect(c.near).toBe(true);expect(arrivalEvidence(c,{...point,accuracy:60,timestamp:now+9000},point,now+9000).near).toBe(false);expect(arrivalEvidence(a,point,point,now).count).toBe(1);
 });
 it('clears the watch once and ignores queued callbacks',()=>{
  let success:PositionCallback=()=>{};const clear=vi.fn(),sample=vi.fn();
  const cancel=subscribeLive({watchPosition:vi.fn(fn=>{success=fn;return 7;}),clearWatch:clear},sample,vi.fn());cancel();cancel();success({coords:{latitude:35,longitude:135,accuracy:10},timestamp:now} as GeolocationPosition);expect(clear).toHaveBeenCalledExactlyOnceWith(7);expect(sample).not.toHaveBeenCalled();
 });
 it('cleans up even when an error is synchronous during registration',()=>{
  const clear=vi.fn(),error=vi.fn();subscribeLive({watchPosition:vi.fn((_s,e)=>{e?.({code:1} as GeolocationPositionError);return 3;}),clearWatch:clear},vi.fn(),error);expect(clear).toHaveBeenCalledExactlyOnceWith(3);expect(error).toHaveBeenCalledWith(1);
 });
});
