import {useEffect,useState}from'react';
import type{Position,Entrance,WalkingRoute}from'./domain/types';
import {positionStatus}from'./domain/journey';
import {requestWalking}from'./domain/routing';
export function useWalking(position:Position|null,entrance:Entrance|undefined,now:number){
 const [result,setResult]=useState<{key:string;route?:WalkingRoute;error?:string;loading?:boolean}>({key:''});
 const fresh=positionStatus(position,now)==='fresh';
 const key=position&&entrance?`${position.timestamp}:${position.lat}:${position.lon}:${entrance.id}`:'';
 useEffect(()=>{
  if(!fresh||!position||!entrance)return;
  const controller=new AbortController();setResult({key,loading:true});
  requestWalking(position,entrance,controller.signal).then(route=>{if(!controller.signal.aborted)setResult({key,route});}).catch(error=>{if(!controller.signal.aborted)setResult({key,error:error instanceof Error?error.message:'徒歩経路を取得できませんでした。'});});
  return()=>controller.abort();
 },[key,fresh]);
 const current=result.key===key&&fresh?result:undefined;
 return {route:current?.route&&now-current.route.fetchedAt<=10*60000?current.route:undefined,loading:current?.loading??false,error:current?.error};
}
