import {useEffect,useRef,useState} from 'react';
import type {Station} from './domain/types';
import {validWesternStation} from './domain/westernStation';
const KEY='mania-u:western-stations:v1';
function load():Station[]{try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(data)?data.slice(0,2000).filter(validWesternStation):[];}catch{return [];}}
export function useWesternStations(selected:string,favorites:string[],directionFavorites:string[]){
 const [stations,setStations]=useState(load),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{try{const ids=new Set([selected,...favorites,...directionFavorites.map(id=>id.split(':')[0])]);localStorage.setItem(KEY,JSON.stringify(stations.filter(s=>ids.has(s.id))));}catch{setError('追加した駅の保存ができませんでした。ブラウザの保存容量を確認してください。');}},[selected,favorites,directionFavorites,stations]);
 async function search(query:string){
  request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/western/search?q='+encodeURIComponent(query),{signal:controller.signal});const data=await response.json();
   if(!response.ok)throw Error(typeof data?.error==='string'?data.error:'追加の駅を検索できませんでした。');
   if(!Array.isArray(data.stations)||data.stations.length>8||!data.stations.every(validWesternStation))throw Error('追加の駅情報を確認できませんでした。');
   if(controller.signal.aborted)return;
   setStations(current=>[...new Map([...current,...data.stations].map(s=>[s.id,s])).values()]);
   setMessage(data.stations.length?`西日本APIから${data.stations.length}件を追加しました。${data.limited?'候補が多いため駅名をさらに絞り込んでください。':''}`:'西日本APIに一致する駅がありません。駅名を変えて検索してください。');
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'追加の駅を検索できませんでした。');}
  finally{if(request.current===controller)setLoading(false);}
 }
 return {stations,loading,message,error,search};
}
