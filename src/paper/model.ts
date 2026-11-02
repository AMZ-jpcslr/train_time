import {judge,type Walking} from '../domain/journey';
import type {Settings} from '../domain/types';
import type {ScheduledDeparture} from '../useTrainSelection';
export function nearbyDepartures(trains:ScheduledDeparture[],now:number){
 const ordered=[...trains].sort((a,b)=>a.epoch-b.epoch);
 return [...ordered.filter(t=>t.epoch<=now).slice(-2),...ordered.filter(t=>t.epoch>now)];
}
export function ticketState(train:ScheduledDeparture,now:number,walk:Walking,settings:Settings){
 if(train.epoch<=now)return{kind:'past',label:'発車時刻を過ぎました'};
 const result=judge(train.epoch,now,walk,settings);
 return{kind:result.status,label:result.status==='comfortable'?'余裕あり':result.status==='tight'?'急げば間に合う':result.status==='miss'?'現在地から間に合わない':'現在地からの判定は未確認'};
}
