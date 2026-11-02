import {describe,it,expect} from 'vitest';
import {nearbyDepartures,ticketState} from '../src/paper/model';
import type {ScheduledDeparture} from '../src/useTrainSelection';
const train=(epoch:number):ScheduledDeparture=>({epoch,time:'14:00',destination:'試験',trainType:'普通',platform:null});
describe('C timetable behavior',()=>{
 it('keeps two recent departures then every future service in chronological order',()=>{expect(nearbyDepartures([train(6),train(1),train(4),train(2),train(5),train(3)],4).map(t=>t.epoch)).toEqual([3,4,5,6]);});
 it.each(['unavailable','failed','estimate'] as const)('does not classify %s location as missed',kind=>{expect(ticketState(train(600000),0,kind==='estimate'?{kind,minutes:2}:{kind},{stationMinutes:3,speedKmh:4.8}).kind).toBe('unknown');});
 it.each([[3,'miss'],[5,'tight'],[8,'comfortable']] as const)('classifies %i minutes with the existing walking and boarding allowance', (minutes,kind)=>{expect(ticketState(train(minutes*60000),0,{kind:'route',minutes:2},{stationMinutes:3,speedKmh:4.8}).kind).toBe(kind);});
 it('labels a departed service independently of GPS',()=>{expect(ticketState(train(0),1,{kind:'unavailable'},{stationMinutes:3,speedKmh:4.8}).kind).toBe('past');});
});
