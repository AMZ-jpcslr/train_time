import {useEffect,useState} from 'react';
import type {Station} from './domain/types';
export const challengeProviderNames={
 'jr-east':'JR東日本',odakyu:'小田急電鉄',keikyu:'京急電鉄',sotetsu:'相模鉄道',keio:'京王電鉄',tobu:'東武鉄道',seibu:'西武鉄道',tokyu:'東急電鉄',
};
export interface ChallengeCoverage {id:string;operator:string;stationCount:number;checkedAt:string;sourceUrl:string;lines:{name:string;stationCount:number}[];audit:{unsupportedCalendars:number;unknownDestinations:number}}
export function validChallengeCatalog(value:unknown,provider:string):value is {stations:Station[];coverage:ChallengeCoverage}{
 if(!value||typeof value!=='object')return false;
 const v=value as {stations:Station[];coverage:ChallengeCoverage};
 if(!Array.isArray(v.stations)||!v.stations.length||v.stations.length>5000||v.coverage?.id!==provider||v.coverage.stationCount!==v.stations.length
  ||v.coverage.operator!==challengeProviderNames[provider as keyof typeof challengeProviderNames]||typeof v.coverage.sourceUrl!=='string'||!/^https:\/\/ckan\.odpt\.org\/dataset\/[a-z0-9_-]+$/.test(v.coverage.sourceUrl)
  ||!Array.isArray(v.coverage.lines)||!v.coverage.lines.length||!v.coverage.lines.every(l=>typeof l.name==='string'&&Number.isInteger(l.stationCount)&&l.stationCount>0)
  ||!v.coverage.audit||![v.coverage.audit.unsupportedCalendars,v.coverage.audit.unknownDestinations].every(n=>Number.isInteger(n)&&n>=0)
  ||!Number.isFinite(Date.parse(v.coverage.checkedAt)))return false;
 const seen=new Set<string>();
 return v.stations.every(s=>{
  if(!s||!new RegExp(`^challenge-${provider}-[a-f0-9]{16}$`).test(s.id)||seen.has(s.id)||s.challengeProvider!==provider
   ||s.timetablePath!==`/api/odpt/timetable?station=${s.id}`||s.operator!==challengeProviderNames[provider as keyof typeof challengeProviderNames]
   ||typeof s.name!=='string'||!s.name||typeof s.line!=='string'||typeof s.code!=='string'||s.sourceUrl!==v.coverage.sourceUrl
   ||!Number.isFinite(s.lat)||!Number.isFinite(s.lon)||s.lat<20||s.lat>50||s.lon<120||s.lon>150
   ||!Array.isArray(s.directions)||!s.directions.length||!s.directions.every(d=>/^d-[a-f0-9]{16}$/.test(d.id)&&typeof d.name==='string')
   ||s.aliases!==undefined&&(!Array.isArray(s.aliases)||!s.aliases.every(a=>typeof a==='string')))return false;
  seen.add(s.id);return true;
 });
}
/** Acquired station facts stay out of source bundles/localStorage and expire with the challenge. */
export function useChallengeCatalog(enabled:boolean,now:number){
 const [state,setState]=useState<{stations:Station[];coverage:ChallengeCoverage[];errors:string[];active:string;loading:boolean}>({stations:[],coverage:[],errors:[],active:'',loading:false});
 const [attempt,setAttempt]=useState(0),withinPeriod=now<Date.parse('2027-03-13T00:00:00+09:00');
 const refreshWindow=Math.floor(now/(6*3600000));
 useEffect(()=>{
  if(!enabled||!withinPeriod)return;
  const controller=new AbortController();let active=true;
  setState({stations:[],coverage:[],errors:[],active:'',loading:true});
  (async()=>{
   for(const [provider,name] of Object.entries(challengeProviderNames)){
    if(!active)break;setState(s=>({...s,active:name}));
    try{
     const response=await fetch('/api/odpt/catalog?provider='+provider,{signal:controller.signal,cache:'no-store'});
     if(!response.ok)throw Error('Unavailable');const value:unknown=await response.json();
     if(!validChallengeCatalog(value,provider))throw Error('Invalid catalog');
     if(active)setState(s=>({...s,stations:[...s.stations,...value.stations],coverage:[...s.coverage,value.coverage]}));
    }catch{if(active)setState(s=>({...s,errors:[...s.errors,name]}));}
   }
   if(active)setState(s=>({...s,loading:false,active:''}));
  })();
  return()=>{active=false;controller.abort();};
 },[enabled,withinPeriod,attempt,refreshWindow]);
 const visible=enabled&&withinPeriod;
 return {...state,stations:visible?state.stations:[],coverage:visible?state.coverage:[],loading:visible&&state.loading,retry:()=>setAttempt(n=>n+1)};
}
