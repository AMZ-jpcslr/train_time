import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {collectPosition,LOCATION_WAIT_MS} from '../src/domain/geolocation';

const NOW=Date.parse('2026-10-22T14:00:00+09:00');
function sample(accuracy:number,overrides:Partial<GeolocationPosition>={}){
 return {coords:{latitude:34.8,longitude:135.5,accuracy,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now(),...overrides} as GeolocationPosition;
}
function source(){
 let success!:PositionCallback;let failure!:PositionErrorCallback;
 const api={watchPosition:vi.fn((ok:PositionCallback,error?:PositionErrorCallback|null,_options?:PositionOptions)=>{success=ok;failure=error!;return 7;}),clearWatch:vi.fn()};
 return {api,emit:(value:GeolocationPosition)=>success(value),fail:(code:number)=>failure({code,message:'Fixture',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3})};
}

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(NOW);});
afterEach(()=>{vi.useRealTimers();});

describe('bounded user-triggered geolocation collection',()=>{
 it('requests fresh high-accuracy fixes and finishes once after 202m improves to 17m',()=>{
  const gps=source(),progress=vi.fn(),finish=vi.fn();collectPosition(gps.api,progress,finish);
  expect(gps.api.watchPosition).toHaveBeenCalledWith(expect.any(Function),expect.any(Function),{enableHighAccuracy:true,maximumAge:0,timeout:LOCATION_WAIT_MS});
  gps.emit(sample(202));expect(finish).not.toHaveBeenCalled();vi.advanceTimersByTime(3000);gps.emit(sample(17));
  expect(progress.mock.calls.map(call=>call[0].accuracy)).toEqual([202,17]);expect(finish).toHaveBeenCalledExactlyOnceWith({position:expect.objectContaining({accuracy:17,timestamp:NOW+3000})});
  expect(gps.api.clearWatch).toHaveBeenCalledExactlyOnceWith(7);gps.emit(sample(5));vi.advanceTimersByTime(LOCATION_WAIT_MS);expect(finish).toHaveBeenCalledTimes(1);expect(progress).toHaveBeenCalledTimes(2);
 });
 it('stops at twenty seconds and preserves a coarse fix for explicit reference display',()=>{
  const gps=source(),finish=vi.fn();collectPosition(gps.api,vi.fn(),finish);gps.emit(sample(202));
  vi.advanceTimersByTime(LOCATION_WAIT_MS-1);expect(finish).not.toHaveBeenCalled();vi.advanceTimersByTime(1);
  expect(finish).toHaveBeenCalledExactlyOnceWith({position:expect.objectContaining({accuracy:202}),errorCode:undefined});expect(gps.api.clearWatch).toHaveBeenCalledWith(7);
 });
 it('keeps the most accurate fresh sample and prefers the newest equal-accuracy sample',()=>{
  const gps=source(),progress=vi.fn(),finish=vi.fn();collectPosition(gps.api,progress,finish);gps.emit(sample(150));vi.advanceTimersByTime(1000);gps.emit(sample(230));gps.emit(sample(150));vi.advanceTimersByTime(LOCATION_WAIT_MS-1000);
  expect(progress).toHaveBeenCalledTimes(2);expect(finish).toHaveBeenCalledWith({position:expect.objectContaining({accuracy:150,timestamp:NOW+1000}),errorCode:undefined});
 });
 it('prefers a fresh coarse sample over an older precise sample',()=>{
  const gps=source(),finish=vi.fn();collectPosition(gps.api,vi.fn(),finish);gps.emit(sample(10,{timestamp:NOW-360000}));gps.emit(sample(202));vi.advanceTimersByTime(LOCATION_WAIT_MS);
  expect(finish).toHaveBeenCalledWith({position:expect.objectContaining({accuracy:202,timestamp:NOW}),errorCode:undefined});
 });
 it('accepts exactly 100m as the threshold for a current fix',()=>{
  const gps=source(),finish=vi.fn();collectPosition(gps.api,vi.fn(),finish);gps.emit(sample(100));expect(finish).toHaveBeenCalledWith({position:expect.objectContaining({accuracy:100})});
 });
 it('does not mistake a stale precise sample for a fresh fix',()=>{
  const gps=source(),finish=vi.fn();collectPosition(gps.api,vi.fn(),finish);gps.emit(sample(5,{timestamp:NOW-360000}));expect(finish).not.toHaveBeenCalled();vi.advanceTimersByTime(LOCATION_WAIT_MS);
  expect(finish).toHaveBeenCalledWith({position:expect.objectContaining({timestamp:NOW-360000}),errorCode:undefined});
 });
 it('ignores invalid coordinates, accuracy and future timestamps',()=>{
  const gps=source(),progress=vi.fn(),finish=vi.fn();collectPosition(gps.api,progress,finish);
  for(const value of [sample(NaN),sample(-1),sample(10,{timestamp:NOW+30001}),sample(10,{coords:{...sample(10).coords,latitude:91}}),sample(10,{coords:{...sample(10).coords,longitude:181}})])gps.emit(value);
  expect(progress).not.toHaveBeenCalled();vi.advanceTimersByTime(LOCATION_WAIT_MS);expect(finish).toHaveBeenCalledExactlyOnceWith({position:null,errorCode:3});
 });
 it('permission denial stops immediately, drops interim data and ignores queued samples',()=>{
  const gps=source(),progress=vi.fn(),finish=vi.fn();collectPosition(gps.api,progress,finish);gps.emit(sample(202));gps.fail(1);gps.emit(sample(17));vi.advanceTimersByTime(LOCATION_WAIT_MS);
  expect(finish).toHaveBeenCalledExactlyOnceWith({position:null,errorCode:1});expect(progress).toHaveBeenCalledTimes(1);expect(gps.api.clearWatch).toHaveBeenCalledExactlyOnceWith(7);
 });
 it('waits through transient unavailability and provider timeout for a usable sample',()=>{
  const gps=source(),finish=vi.fn();collectPosition(gps.api,vi.fn(),finish);gps.fail(2);gps.fail(3);expect(finish).not.toHaveBeenCalled();gps.emit(sample(17));expect(finish).toHaveBeenCalledWith({position:expect.objectContaining({accuracy:17})});
 });
 it('reports the last transient error when the deadline arrives without a valid sample',()=>{
  const gps=source(),finish=vi.fn();collectPosition(gps.api,vi.fn(),finish);gps.fail(2);vi.advanceTimersByTime(LOCATION_WAIT_MS);expect(finish).toHaveBeenCalledExactlyOnceWith({position:null,errorCode:2});
 });
 it('cancellation clears the watch and suppresses late callbacks and deadline completion',()=>{
  const gps=source(),progress=vi.fn(),finish=vi.fn();const cancel=collectPosition(gps.api,progress,finish);gps.emit(sample(202));cancel();gps.emit(sample(17));gps.fail(1);vi.advanceTimersByTime(LOCATION_WAIT_MS);
  expect(gps.api.clearWatch).toHaveBeenCalledWith(7);expect(finish).not.toHaveBeenCalled();expect(progress).toHaveBeenCalledTimes(1);
 });
 it('clears a watch whose adapter delivers a satisfactory sample synchronously',()=>{
  const clearWatch=vi.fn(),finish=vi.fn();collectPosition({watchPosition:(ok)=>{ok(sample(17));return 42;},clearWatch},vi.fn(),finish);
  expect(clearWatch).toHaveBeenCalledExactlyOnceWith(42);expect(finish).toHaveBeenCalledTimes(1);vi.advanceTimersByTime(LOCATION_WAIT_MS);expect(finish).toHaveBeenCalledTimes(1);
 });
 it('reports synchronous browser failure without leaving a pending timer',()=>{
  const finish=vi.fn();collectPosition({watchPosition:()=>{throw Error('Browser unavailable');},clearWatch:vi.fn()},vi.fn(),finish);
  expect(finish).toHaveBeenCalledExactlyOnceWith({position:null,errorCode:2});expect(vi.getTimerCount()).toBe(0);
 });
});
