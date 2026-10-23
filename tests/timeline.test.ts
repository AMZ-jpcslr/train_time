import {describe,it,expect} from 'vitest';
import {recommendedTrain,reachableTrains,serviceTimeline,timelineCursor} from '../src/domain/timeline';
import {departureEpoch,selectTable} from '../src/domain/time';
import type {Timetable} from '../src/domain/types';
import {neighboringStations} from '../src/data/neighbors';
const day='2026-10-23',now=departureEpoch(day,'14:00'),settings={stationMinutes:3,speedKmh:4.5};
const table={stationId:'test',directionId:'east',dayType:'weekday',departures:['13:50','14:01','14:05','14:10','14:15','14:20','14:25','14:30','14:35','14:40','24:10'].map(time=>({time,destination:'試験終点',trainType:'普通',platform:null}))} as Timetable;
describe('complete service timeline and reachable recommendations',()=>{
 it('keeps past departures, more than five future departures and next-day notation ordered in JST',()=>{
  const trains=serviceTimeline(table,day);expect(trains).toHaveLength(11);expect(trains[0].epoch).toBeLessThan(now);expect(trains.at(-1)?.epoch).toBe(Date.parse('2026-10-24T00:10:00+09:00'));
 });
 it('extends beyond five misses to at least three reachable departures without changing the allowance',()=>{
  const trains=serviceTimeline(table,day),walk={kind:'measured' as const,minutes:22};
  expect(recommendedTrain(trains,now,walk,settings)?.time).toBe('14:25');expect(reachableTrains(trains,now,walk,settings)).toHaveLength(5);
  expect(reachableTrains(trains,now+1,walk,settings)[0].time).toBe('14:30');
 });
 it('does not fabricate extra trains or a positive judgment when fewer than three remain',()=>{
  const trains=serviceTimeline(table,day);expect(reachableTrains(trains,departureEpoch(day,'23:00'),{kind:'measured',minutes:1},settings)).toHaveLength(1);
  expect(reachableTrains(trains,departureEpoch(day,'24:10'),{kind:'measured',minutes:1},settings)).toHaveLength(0);
  for(const kind of ['unavailable','failed','estimate'] as const)expect(reachableTrains(trains,now,{kind,minutes:1},settings)).toEqual([]);
  expect(serviceTimeline(undefined,day)).toEqual([]);expect(recommendedTrain([],now,{kind:'measured',minutes:1},settings)).toBeUndefined();
 });
 it('uses the service day type rather than substituting a weekday timetable',()=>{
  expect(selectTable([table],'test','east','2026-10-24')).toBeUndefined();
  expect(selectTable([table],'test','east',day)).toBe(table);
 });
 it('interpolates the scroll cursor and reverses the adjacent-station context on direction change',()=>{
  const trains=serviceTimeline(table,day);expect(timelineCursor(trains,1.5)).toBe(departureEpoch(day,'14:03'));expect(timelineCursor([],1)).toBeNull();
  expect(neighboringStations('kyoto-imadegawa','north').after).toBe('鞍馬口');expect(neighboringStations('kyoto-imadegawa','south').after).toBe('丸太町');
 });
});
