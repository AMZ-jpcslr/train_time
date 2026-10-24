// Live verification uses the encrypted credential internally, never logs it or an authenticated URL.
import {createChallengeService} from '../server/odpt-challenge-service.mjs';
import {challengeProviders} from '../server/odpt-challenge-providers.mjs';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const service=createChallengeService({local:true}),status=await service.status();
if(!status.enabled){console.log('ODPT credential is not configured or is unavailable.');process.exitCode=2;}
else{
 const results=[];
 for(const p of challengeProviders){
  try{
   const data=await service.catalog(p.id);
   const snapshot=JSON.parse(gunzipSync(await readFile(new URL(`../.cache/odpt-challenge/${p.id}.json.gz`,import.meta.url))).toString());
   const names=(await readdir(new URL('../.cache/odpt-challenge/',import.meta.url))).filter(name=>name.startsWith(p.id+'-source-')&&name.endsWith('.json.gz'));
   let raw,hash;
   for(const name of names){const bytes=gunzipSync(await readFile(new URL('../.cache/odpt-challenge/'+name,import.meta.url)));const source=JSON.parse(bytes),candidateHash=createHash('sha256').update(bytes).digest('hex');if(snapshot.sourceHash?candidateHash===snapshot.sourceHash:source.StationTimetable.length===data.coverage.audit.sourceTables){raw=source;hash=candidateHash;}}
   if(!raw)throw Error('Missing source evidence');
   // Independent comparison of every source station/direction/calendar/time multiset.
   const expected=new Map(),actual=new Map(),kinds={Weekday:'weekday',Saturday:'saturday',Sunday:'holiday',Holiday:'holiday',SaturdayHoliday:'weekend'};
   const add=(map,key)=>map.set(key,(map.get(key)||0)+1);
   const short=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
   for(const row of raw.StationTimetable){
    const kind=kinds[String(row['odpt:calendar']).replace('odpt.Calendar:','')]||(raw.Calendar?.some(c=>c['owl:sameAs']===row['odpt:calendar']&&Array.isArray(c['odpt:day'])&&c['odpt:day'].length)?'weekday':null);if(!kind)continue;
    const id=`challenge-${p.id}-`+short(row['odpt:station']+'/'+row['odpt:railway']),direction='d-'+short(row['odpt:railDirection']);
    for(const dep of row['odpt:stationTimetableObject']||[]){const [h,...rest]=dep['odpt:departureTime'].split(':'),time=String(Number(h)<4?Number(h)+24:Number(h)).padStart(2,'0')+':'+rest.join(':');add(expected,JSON.stringify([id,direction,kind,time]));}
   }
   for(const [id,tables] of Object.entries(snapshot.tables))for(const table of tables)for(const d of table.departures)add(actual,JSON.stringify([id,table.directionId,table.dayType,d.time]));
   if(expected.size!==actual.size||[...expected].some(([key,n])=>actual.get(key)!==n))throw Error('Source departures differ');
   const value={...data.coverage,sourceHash:hash,allSourceDepartureTimesMatched:true,matchedDepartureCount:[...expected.values()].reduce((a,b)=>a+b,0)};
   results.push(value);console.log(JSON.stringify({operator:p.name,stations:value.stationCount,lines:value.lines.length,matchedDepartures:value.matchedDepartureCount,unknownDestinations:value.audit.unknownDestinations}));
  }catch{results.push({id:p.id,operator:p.name,error:'Acquisition or validation failed. No secret-bearing upstream error is recorded.'});console.log(p.name+': acquisition/validation failed.');}
 }
 await mkdir('.cache/verification',{recursive:true});await writeFile('.cache/verification/odpt-challenge-live.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
 if(results.some(p=>p.error))process.exitCode=1;
}
