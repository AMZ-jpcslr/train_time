import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('.cache/osm/added',{recursive:true});
const regions={kochi:[33.45,133.35,33.65,133.8],arakawa:[35.70,139.69,35.77,139.81],setagaya:[35.637,139.633,35.676,139.676]};
for(const [region,bounds] of Object.entries(regions)){
 const bbox=bounds.join(','),query=`[out:json][timeout:60];(way[railway=platform](${bbox});way[public_transport=platform](${bbox});)->.p;way(around.p:30)[highway~"^(footway|path|steps|pedestrian)$"]->.w;(.p;.w;);out geom;`;
 const file=`.cache/osm/added/tram-${region}.json`;
 if(process.argv.includes('--refresh')){
  const url=new URL('https://overpass-api.de/api/interpreter');url.searchParams.set('data',query);
  const response=await fetch(url,{headers:{'User-Agent':'train-time/0.3 (https://github.com/AMZ-jpcslr/train_time; cached station access research)'},signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error('Overpass '+response.status);
  const raw=await response.text(),data=JSON.parse(raw);if(data.remark)throw Error('Incomplete OSM response');
  await writeFile(file,raw);await writeFile(file.replace('.json','-meta.json'),JSON.stringify({sourceUrl:'https://overpass-api.de/api/interpreter',retrievedAt:new Date().toISOString(),sha256:createHash('sha256').update(raw).digest('hex'),query},null,2)+'\n');
 }
 const data=JSON.parse(await readFile(file,'utf8'));console.log(region,data.elements.length);
}
