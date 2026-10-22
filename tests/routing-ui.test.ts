import {describe,expect,it} from 'vitest';
import {googleWalkingUrl,needsAccessCheck,validWalkingRoute} from '../src/domain/routing';
import {judge} from '../src/domain/journey';
import type {WalkingRoute} from '../src/domain/types';

describe('road access estimates and external walking handoff',()=>{
 it('separates long access segments from boarding judgments',()=>{
  expect(needsAccessCheck({snapDistances:[30,0]})).toBe(false);
  expect(needsAccessCheck({snapDistances:[30.01,0]})).toBe(true);
  expect(needsAccessCheck({snapDistances:[0,90]})).toBe(true);
  expect(judge(3600000,0,{kind:'estimate',minutes:4},{speedKmh:4.8,stationMinutes:3,bufferMinutes:2})).toEqual({status:'unknown',label:'判定不可',slack:null});
 });
 it('hands the original coordinates to Google walking directions without a key',()=>{
  const url=new URL(googleWalkingUrl({lat:34.81,lon:135.56},{lat:34.815,lon:135.565}));
  expect(url.origin+url.pathname).toBe('https://www.google.com/maps/dir/');
  expect(Object.fromEntries(url.searchParams)).toEqual({api:'1',origin:'34.81,135.56',destination:'34.815,135.565',travelmode:'walking'});
 });
 it('rejects malformed access distances before the UI can classify a route',()=>{
  const route={kind:'route',entranceId:'e',distanceMeters:320,roadDistanceMeters:240,durationSeconds:256,fetchedAt:1,snapDistances:[70,10],geometry:[[135,35],[135,35.001]]} as WalkingRoute;
  expect(validWalkingRoute(route,'e')).toBe(true);
  expect(validWalkingRoute({...route,snapDistances:[NaN,10]},'e')).toBe(false);
  expect(validWalkingRoute({...route,snapDistances:[]},'e')).toBe(false);
  expect(validWalkingRoute({...route,roadDistanceMeters:-1},'e')).toBe(false);
  expect(validWalkingRoute({...route,snapDistances:[201,0]},'e')).toBe(false);
  expect(validWalkingRoute({...route,geometry:Array.from({length:20001},()=>[135,35])},'e')).toBe(false);
 });
});
