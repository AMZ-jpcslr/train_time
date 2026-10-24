import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const query='[out:json][timeout:60];way[building=train_station](34.9,138.1,38.0,141.2);out geom;';
const file='.cache/osm/added/buildings.json';
if(process.argv.includes('--refresh')){
 const url=new URL('https://overpass-api.de/api/interpreter');url.searchParams.set('data',query);
 const response=await fetch(url,{headers:{'User-Agent':'train-time/0.3 (https://github.com/AMZ-jpcslr/train_time; cached station access research)'},signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error('Overpass '+response.status);
 const raw=await response.text(),data=JSON.parse(raw);if(data.remark)throw Error('Incomplete OSM response');
 await writeFile(file,raw);await writeFile(file.replace('.json','-meta.json'),JSON.stringify({sourceUrl:'https://overpass-api.de/api/interpreter',retrievedAt:new Date().toISOString(),sha256:createHash('sha256').update(raw).digest('hex'),query},null,2)+'\n');
}
console.log('Station buildings',JSON.parse(await readFile(file,'utf8')).elements.length);
