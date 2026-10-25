import {useEffect,useState} from 'react';
import type {Station,Timetable} from './domain/types';
import {validWesternStation} from './domain/westernStation';

export function validStationTables(data:unknown,station:Station):data is Timetable[]{
 if(!Array.isArray(data)||!data.length)return false;
 const ids=new Set<string>();
 return data.every(t=>{
  if(!t||typeof t.id!=='string'||ids.has(t.id)||t.stationId!==station.id||t.operator!==station.operator||t.line!==station.line
   ||!station.directions.some(d=>d.id===t.directionId)||!Array.isArray(t.serviceDates)||!t.serviceDates.length
   ||!t.serviceDates.every((d:unknown)=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d))
   ||!Number.isFinite(Date.parse(t.checkedAt))||!(validWesternStation(station)?t.verification==='partial'&&t.sourceUrl==='https://api.transit.ls8h.com/':t.verification==='verified')||!Array.isArray(t.notes)
   ||!Array.isArray(t.departures)||!t.departures.length)return false;
  ids.add(t.id);
  return t.departures.every((d:Timetable['departures'][number],i:number)=>d&&/^(?:0[4-9]|1\d|2[0-7]):[0-5]\d(?::[0-5]\d)?$/.test(d.time)
   &&typeof d.destination==='string'&&d.destination.length>0&&(d.trainType===null||typeof d.trainType==='string')
   &&(d.platform===null||typeof d.platform==='string')&&(d.trainNumber===undefined||typeof d.trainNumber==='string')&&(i===0||t.departures[i-1].time<=d.time));
 });
}

/** Only the selected station is fetched. A late response can never replace another station. */
export function useStationTimetables(station:Station,day?:string,now=Date.now()){
 const [state,setState]=useState<{path:string;tables:Timetable[];error:string}>({path:'',tables:[],error:''});
 const [attempt,setAttempt]=useState(0);
 const dated=station.challengeProvider||station.westernProvider;
 const path=station.timetablePath?(dated?station.timetablePath+'&date='+encodeURIComponent(day??''):station.timetablePath):'';
 const interval=station.westernProvider?3600000:6*3600000;
 const refreshWindow=dated?Math.floor(now/interval):0;
 useEffect(()=>{
  if(!path)return;
  let active=true;let refresh:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();
  setState({path:'',tables:[],error:''});
  fetch(path,{signal:controller.signal}).then(async response=>{
   if(!response.ok){const failure=await response.json().catch(()=>null);throw Error(typeof failure?.error==='string'&&/^(ODPT|西日本API)/.test(failure.error)?failure.error:'時刻表を読み込めませんでした。通信状態を確認して再試行してください。');}
   const data:unknown=await response.json();
   if(!validStationTables(data,station))throw Error('時刻表の形式を確認できませんでした。再取得してください。');
   if(active){
    setState({path,tables:data,error:''});
    if(dated){const expires=Math.min(...data.map(t=>Date.parse(t.checkedAt)))+interval;refresh=setTimeout(()=>setAttempt(n=>n+1),Math.max(30000,expires-Date.now()+1000));}
   }
  }).catch(error=>{if(active)setState({path,tables:[],error:error instanceof TypeError?'時刻表を読み込めませんでした。オフラインの場合は、一度オンラインでこの駅を開いてください。':error instanceof Error?error.message:'時刻表の読み込みに失敗しました。'});});
  return()=>{active=false;controller.abort();if(refresh)clearTimeout(refresh);};
 },[path,attempt,refreshWindow]);
 return {tables:state.path===path?state.tables:[],loading:Boolean(path&&state.path!==path),
  error:state.path===path?state.error:'',retry:()=>setAttempt(n=>n+1)};
}
