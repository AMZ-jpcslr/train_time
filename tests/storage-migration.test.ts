import {afterEach,describe,expect,it,vi} from 'vitest';
import {defaults,load,save} from '../src/domain/storage';

const legacyState=()=>({
 stationId:'jr-ibaraki',directionId:'west',favorites:['jr-ibaraki:west','hankyu-rokko:east'],
 places:[{id:'home',name:'自宅',stationId:'jr-ibaraki',entrance:'east',walkMinutes:8.5}],
 settings:{stationMinutes:7,bufferMinutes:12,speedKmh:3.6},
});

describe('retired boarding buffer storage migration',()=>{
 afterEach(()=>vi.unstubAllGlobals());

 it('preserves station, direction, favorites, places and remaining settings from v1',()=>{
  const legacy=legacyState();
  const getItem=vi.fn(()=>JSON.stringify(legacy));
  const setItem=vi.fn();
  vi.stubGlobal('localStorage',{getItem,setItem});
  const loaded=load();
  expect(getItem).toHaveBeenCalledWith('mania-u:v1');
  expect(loaded).toEqual({...legacy,stationFavorites:[],settings:{stationMinutes:7,speedKmh:3.6}});
  expect(loaded.settings).not.toHaveProperty('bufferMinutes');
  expect(setItem).not.toHaveBeenCalled();
  expect(save(loaded)).toBe(true);
  expect(setItem).toHaveBeenCalledWith('mania-u:v1',JSON.stringify(loaded));
 });

 it('strips retired settings even when saving an older in-memory state',()=>{
  const setItem=vi.fn();
  vi.stubGlobal('localStorage',{setItem});
  const legacy=legacyState();
  expect(save(legacy)).toBe(true);
  expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({...legacy,settings:{stationMinutes:7,speedKmh:3.6}});
 });

 it('ignores malformed retired values without resetting supported preferences',()=>{
  const legacy=legacyState();
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({...legacy,settings:{...legacy.settings,bufferMinutes:-99}})});
  expect(load().settings).toEqual({stationMinutes:7,speedKmh:3.6});
 });

 it('keeps the combined station default at three minutes with no separate buffer',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});
  expect(load().settings).toEqual({stationMinutes:3,speedKmh:4.8});
  expect(defaults.settings).not.toHaveProperty('bufferMinutes');
 });

 it('reports a failed migration save while retaining the previous usable stored data',()=>{
  const original=JSON.stringify(legacyState());
  const getItem=vi.fn(()=>original);
  vi.stubGlobal('localStorage',{getItem,setItem:()=>{throw new DOMException('Storage full','QuotaExceededError');}});
  const loaded=load();
  expect(save(loaded)).toBe(false);
  expect(getItem()).toBe(original);
  expect(load()).toEqual(loaded);
  expect(load().settings).not.toHaveProperty('bufferMinutes');
 });

 it('returns usable defaults when access to local storage itself is denied',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw new DOMException('Storage blocked','SecurityError');},setItem:()=>{throw new DOMException('Storage blocked','SecurityError');}});
  expect(load()).toEqual(defaults);
  expect(save(load())).toBe(false);
 });
});
