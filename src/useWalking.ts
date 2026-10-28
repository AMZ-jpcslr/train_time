import {useEffect,useState}from'react';
import type{Position,Entrance,WalkingRoute}from'./domain/types';
import {positionStatus}from'./domain/journey';
import {requestWalking,routeMatchesRequest}from'./domain/routing';
export function useWalking(position:Position|null,entrance:Entrance|undefined,now:number){
 const [result,setResult]=useState<{key:string;route?:WalkingRoute;error?:string;loading?:boolean}>({key:''});
 const [revision,setRevision]=useState(0);
 const fresh=positionStatus(position,now)==='fresh';
 const key=position&&entrance?`${position.timestamp}:${position.lat}:${position.lon}:${entrance.id}:${revision}`:'';
 useEffect(()=>{
  if(!fresh||!position||!entrance)return;
  const controller=new AbortController();setResult({key,loading:true});
  const timeout=setTimeout(()=>{if(controller.signal.aborted)return;controller.abort();setResult({key,error:'徒歩経路の取得がタイムアウトしました。もう一度取得するか、徒歩時間を入力してください。'});},20000);
  requestWalking(position,entrance,controller.signal).then(route=>{clearTimeout(timeout);if(!controller.signal.aborted)setResult({key,route});}).catch(error=>{clearTimeout(timeout);if(!controller.signal.aborted)setResult({key,error:error instanceof TypeError?'徒歩経路を取得できませんでした。通信状態を確認して、もう一度計算してください。':error instanceof Error?error.message:'徒歩経路を取得できませんでした。'});});
  return()=>{clearTimeout(timeout);controller.abort();};
 },[key,fresh]);
 const current=result.key===key&&fresh?result:undefined;
 return {route:current?.route&&position&&routeMatchesRequest(current.route,position,now)?current.route:undefined,loading:current?.loading??false,error:current?.error,refresh:()=>setRevision(value=>value+1)};
}
