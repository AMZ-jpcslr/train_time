import {describe,it,expect} from 'vitest';
import {leavingWindow} from '../src/domain/journey';
const settings={speedKmh:4.8,stationMinutes:3};
describe('time remaining at the departure location',()=>{
 it('deducts only walking and combined station time for routed and registered places',()=>{
  const now=Date.parse('2026-10-22T14:00:00+09:00'),departure=now+20*60000;
  expect(leavingWindow(departure,now,{kind:'route',minutes:7},settings)).toEqual({leaveAt:now+10*60000,remainingMs:10*60000,seconds:600});
  expect(leavingWindow(departure,now,{kind:'measured',minutes:9},settings)?.seconds).toBe(480);
 });
 it('calculates an independent stay deadline for each upcoming train',()=>{
  const now=Date.parse('2026-10-22T14:00:00+09:00');
  const departures=[now+9*60000,now+19*60000,now+29*60000];
  const windows=departures.map(departure=>leavingWindow(departure,now,{kind:'measured',minutes:7},settings));
  expect(windows.map(window=>window?.remainingMs)).toEqual([-60000,9*60000,19*60000]);
  expect(windows.map(window=>window?.seconds)).toEqual([0,540,1140]);
 });
 it('does not deduct a retired buffer still present in an old in-memory object',()=>{
  const legacySettings={...settings,bufferMinutes:12};
  expect(leavingWindow(20*60000,0,{kind:'route',minutes:7},legacySettings)).toEqual({leaveAt:10*60000,remainingMs:10*60000,seconds:600});
 });
 it('counts down from current time without rounding negative slack up to available time',()=>{
  expect(leavingWindow(600000,419001,{kind:'route',minutes:0},settings)?.seconds).toBe(0);
  expect(leavingWindow(600000,420000,{kind:'route',minutes:0},settings)?.remainingMs).toBe(0);
  expect(leavingWindow(600000,420001,{kind:'route',minutes:0},settings)?.remainingMs).toBe(-1);
 });
 it('handles departure after midnight and subtracts fractional measured minutes',()=>{
  const now=Date.parse('2026-10-22T23:58:00+09:00'),departure=Date.parse('2026-10-23T00:10:00+09:00');
  expect(leavingWindow(departure,now,{kind:'measured',minutes:1.5},settings)).toEqual({leaveAt:Date.parse('2026-10-23T00:05:30+09:00'),remainingMs:450000,seconds:450});
 });
 it('does not promise time to stay for unverified access, unavailable data or malformed input',()=>{
  expect(leavingWindow(600000,0,{kind:'estimate',minutes:1},settings)).toBeNull();
  expect(leavingWindow(600000,0,{kind:'unavailable'},settings)).toBeNull();
  expect(leavingWindow(NaN,0,{kind:'route',minutes:1},settings)).toBeNull();
  expect(leavingWindow(600000,0,{kind:'route',minutes:1},{...settings,stationMinutes:-1})).toBeNull();
 });
});
