import {useEffect,useState} from 'react';
import type {Departure} from './domain/types';
export type ScheduledDeparture=Departure&{epoch:number};
export const departureKey=(train:ScheduledDeparture)=>JSON.stringify([train.epoch,train.destination,train.trainType,train.platform]);
export const departureRank=(index:number)=>index===0?'先発':index===1?'次発':`${index+1}本目`;

export function useTrainSelection(departures:ScheduledDeparture[],context:string,now:number){
 const [choice,setChoice]=useState<{context:string;id:string;epoch:number}|null>(null);
 const [notice,setNotice]=useState('');
 const match=choice?.context===context?departures.find(train=>departureKey(train)===choice.id):undefined;
 const selected=match??departures[0];
 const missing=Boolean(choice?.context===context&&!match);
 const departed=Boolean(choice&&choice.epoch<=now);
 useEffect(()=>{setChoice(null);setNotice('');},[context]);
 useEffect(()=>{
  if(!missing)return;
  setChoice(null);setNotice(departed?'選んだ電車は予定発車時刻を過ぎたため、選択を解除しました。':'時刻表の更新で選んだ電車を確認できなくなったため、選択を解除しました。');
 },[missing,departed]);
 return {selected,index:selected?departures.indexOf(selected):-1,notice,select:(train:ScheduledDeparture)=>{setChoice({context,id:departureKey(train),epoch:train.epoch});setNotice('');}};
}
