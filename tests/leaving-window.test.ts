import {describe,it,expect} from 'vitest';
import {leavingWindow} from '../src/domain/journey';
const settings={speedKmh:4.8,stationMinutes:3,bufferMinutes:2};
describe('time remaining at the departure location',()=>{
 it('deducts walking, station movement and safety for routed and registered places',()=>{
  const now=Date.parse('2026-10-22T14:00:00+09:00'),departure=now+20*60000;
  expect(leavingWindow(departure,now,{kind:'route',minutes:7},settings)).toEqual({leaveAt:now+8*60000,remainingMs:8*60000,seconds:480});
  expect(leavingWindow(departure,now,{kind:'measured',minutes:9},settings)?.seconds).toBe(360);
 });
 it('counts down from current time without rounding negative slack up to available time',()=>{
  expect(leavingWindow(600000,299001,{kind:'route',minutes:0},settings)?.seconds).toBe(0);
  expect(leavingWindow(600000,300000,{kind:'route',minutes:0},settings)?.remainingMs).toBe(0);
  expect(leavingWindow(600000,300001,{kind:'route',minutes:0},settings)?.remainingMs).toBe(-1);
 });
 it('handles departure after midnight and subtracts fractional measured minutes',()=>{
  const now=Date.parse('2026-10-22T23:58:00+09:00'),departure=Date.parse('2026-10-23T00:10:00+09:00');
  expect(leavingWindow(departure,now,{kind:'measured',minutes:1.5},settings)).toEqual({leaveAt:Date.parse('2026-10-23T00:03:30+09:00'),remainingMs:330000,seconds:330});
 });
 it('does not promise time to stay for unverified access, unavailable data or malformed input',()=>{
  expect(leavingWindow(600000,0,{kind:'estimate',minutes:1},settings)).toBeNull();
  expect(leavingWindow(600000,0,{kind:'unavailable'},settings)).toBeNull();
  expect(leavingWindow(NaN,0,{kind:'route',minutes:1},settings)).toBeNull();
  expect(leavingWindow(600000,0,{kind:'route',minutes:1},{...settings,bufferMinutes:-1})).toBeNull();
 });
});
