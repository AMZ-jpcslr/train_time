import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {matchEntrances,meters} from './lib/entrance-match.mjs';
const stations=JSON.parse(await readFile('src/data/odpt-stations.json','utf8'));
for(const provider of ['jr-east','odakyu','keikyu','sotetsu','keio','tobu','seibu','tokyu']){
 const snapshot=JSON.parse(gunzipSync(await readFile(`.cache/odpt-challenge/${provider}.json.gz`)));
 stations.push(...snapshot.stations);
}
const elements=[],sources=[];
for(const region of ['kanto','kochi','buildings']){
 const raw=await readFile(`.cache/osm/added/${region}.json`),meta=JSON.parse(await readFile(`.cache/osm/added/${region}-meta.json`,'utf8'));
 if(createHash('sha256').update(raw).digest('hex')!==meta.sha256)throw Error('OSM source hash mismatch: '+region);
 const data=JSON.parse(raw);if(data.remark)throw Error('Incomplete OSM response');
 elements.push(...data.elements);sources.push({...meta,region});
}
const checkedAt=sources.map(s=>s.retrievedAt).sort()[0];
const {entrances,audit}=matchEntrances(stations,[...new Map(elements.map(e=>[e.type+'/'+e.id,e])).values()],checkedAt);
for(const e of entrances){
 const station=stations.find(s=>s.id===e.stationId);
 if(!station||meters(station,e)>650||(station.lat===e.lat&&station.lon===e.lon))throw Error('Invalid station access coordinate: '+e.id);
}
if(new Set(entrances.map(e=>e.id)).size!==entrances.length)throw Error('Duplicate entrance IDs');
await mkdir('.cache/verification',{recursive:true});
await writeFile('.cache/verification/added-entrances-audit.json',JSON.stringify({checkedAt,sources,audit},null,2)+'\n');
const coverage=[...new Set(stations.map(s=>s.operator))].map(operator=>{
 const ids=new Set(stations.filter(s=>s.operator===operator).map(s=>s.id)),rows=audit.filter(a=>ids.has(a.stationId));
 return {operator,total:ids.size,covered:rows.filter(r=>r.entranceCount>0).length,entranceCount:rows.reduce((n,r)=>n+r.entranceCount,0)};
});
// Public OSM-derived facts contain no private source timetables or credentials.
await writeFile('src/data/added-entrances.json',JSON.stringify(entrances)+'\n');
await writeFile('src/data/entrance-coverage.json',JSON.stringify({checkedAt,sources,coverage},null,2)+'\n');
console.log(JSON.stringify({entrances:entrances.length,coverage},null,2));
