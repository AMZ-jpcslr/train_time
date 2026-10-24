// Offline, cached research only. The application never calls Overpass.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const regions={kanto:[34.9,138.1,38.0,141.2],kochi:[33.45,133.35,33.65,133.8]};
await mkdir('.cache/osm/added',{recursive:true});
for(const [name,bounds] of Object.entries(regions)){
 const bbox=bounds.join(',');
 const query=`[out:json][timeout:100];
 (node[railway~"^(subway_entrance|train_station_entrance)$"](${bbox});node[public_transport=entrance](${bbox});)->.entrances;
 (nwr[railway=station](${bbox});nwr[public_transport=station](${bbox});way[building=train_station](${bbox});)->.stations;
 rel[public_transport=stop_area](${bbox})->.areas;
 (node(w.stations)[entrance];.entrances;.stations;.areas;);out body center;`;
 const file=`.cache/osm/added/${name}.json`,metaFile=`.cache/osm/added/${name}-meta.json`;
 if(process.argv.includes('--refresh')){
  const url=new URL('https://overpass-api.de/api/interpreter');url.searchParams.set('data',query);
  const response=await fetch(url,{headers:{'User-Agent':'train-time/0.3 (https://github.com/AMZ-jpcslr/train_time; cached station access research)'},signal:AbortSignal.timeout(125000)});
  if(!response.ok)throw Error(`Overpass ${name}: ${response.status}`);
  const raw=await response.text(),data=JSON.parse(raw);
  if(data.remark||!Array.isArray(data.elements))throw Error(`Incomplete Overpass response: ${name}`);
  await writeFile(file,raw);
  await writeFile(metaFile,JSON.stringify({sourceUrl:'https://overpass-api.de/api/interpreter',retrievedAt:new Date().toISOString(),sha256:createHash('sha256').update(raw).digest('hex'),query},null,2)+'\n');
 }
 const data=JSON.parse(await readFile(file,'utf8'));
 console.log(JSON.stringify({region:name,elements:data.elements.length,entranceNodes:data.elements.filter(e=>e.type==='node'&&(e.tags?.entrance||e.tags?.railway?.includes('entrance')||e.tags?.public_transport==='entrance')).length,stopAreas:data.elements.filter(e=>e.tags?.public_transport==='stop_area').length}));
}
