import {departureEpoch} from './time';
import {judge,type Walking} from './journey';
import type {Settings,Timetable} from './types';
import type {ScheduledDeparture} from '../useTrainSelection';

export function serviceTimeline(table:Timetable|undefined,day:string):ScheduledDeparture[]{
 return table?table.departures.map(train=>({...train,epoch:departureEpoch(day,train.time)})).sort((a,b)=>a.epoch-b.epoch):[];
}
export function reachableTrains(trains:ScheduledDeparture[],now:number,walk:Walking,settings:Settings){
 return trains.filter(train=>train.epoch>now&&(judge(train.epoch,now,walk,settings).slack??-1)>=0);
}
export function recommendedTrain(trains:ScheduledDeparture[],now:number,walk:Walking,settings:Settings){
 const future=trains.filter(train=>train.epoch>now);
 return future.slice(0,5).filter(train=>judge(train.epoch,now,walk,settings).status==='miss').length>=4
  ?reachableTrains(future,now,walk,settings)[0]??future[0]:future[0];
}
// The diagram uses departure-time order, never distance or a fabricated travel speed.
export function timelineCursor(trains:ScheduledDeparture[],index:number){
 const bounded=Math.max(0,Math.min(trains.length-1,index));
 const left=Math.floor(bounded),right=Math.min(trains.length-1,left+1);
 return trains[left]?trains[left].epoch+(trains[right].epoch-trains[left].epoch)*(bounded-left):null;
}
