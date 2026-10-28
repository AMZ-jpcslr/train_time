import {useEffect,useRef,useState} from 'react';
import type {Position} from '../domain/types';
import {arrivalEvidence,noArrival} from '../domain/liveLocation';
export function useDepartureFlap(train:{epoch:number;time:string;destination:string}|undefined,context:string,now:number,enabled:boolean){
 const previous=useRef<{id:string;epoch:number;context:string}|null>(null),[flap,setFlap]=useState(false);
 const id=train?`${train.epoch}:${train.time}:${train.destination}`:'';
 useEffect(()=>{
  const before=previous.current;previous.current=train?{id,epoch:train.epoch,context}:null;
  if(!enabled||!train||!before||before.context!==context||before.id===id||before.epoch>now||now-before.epoch>60000||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){setFlap(false);return;}
  setFlap(true);const timer=setTimeout(()=>setFlap(false),360);return()=>clearTimeout(timer);
 },[id,context,enabled]);
 return flap;
}
export function useEntranceArrival(sample:Position|null,target:{lat:number;lon:number}|undefined,context:string,active:boolean,now:number){
 const evidence=useRef({...noArrival}),key=useRef(''),seen=useRef(false),[near,setNear]=useState(false),[clip,setClip]=useState(false);
 useEffect(()=>{
  if(key.current!==context){key.current=context;evidence.current={...noArrival};seen.current=false;setNear(false);setClip(false);}
  if(!active||!sample||!target){evidence.current={...noArrival};setNear(false);setClip(false);return;}
  evidence.current=arrivalEvidence(evidence.current,sample,target,now);setNear(evidence.current.near);
  if(!evidence.current.near||seen.current)return;
  seen.current=true;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  setClip(true);const timer=setTimeout(()=>setClip(false),450);return()=>clearTimeout(timer);
 },[sample?.timestamp,context,active,target?.lat,target?.lon,Boolean(sample)]);
 return {near,clip};
}
