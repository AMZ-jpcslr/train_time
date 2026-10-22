import {mkdir,readFile,writeFile} from 'node:fs/promises';
const centres=[['kobe-gakuentoshi',34.6811,135.0582],['kobe-myohoji',34.6754,135.1108],['jr-nishinomiya',34.7388,135.3474],['jr-osaka',34.7025,135.4959],['jr-ibaraki',34.815,135.562],['jr-minamikusatsu',35.0037,135.9476],['kyoto-imadegawa',35.0301,135.7593],['hankyu-rokko',34.7195,135.2341],['hankyu-sannomiya',34.6933,135.1927],['hankyu-umeda',34.7055,135.4983],['hanshin-koshien',34.7238,135.3632]];
const query='[out:json][timeout:25];('+centres.map(([,lat,lon])=>`node(${lat-.0032},${lon-.004},${lat+.0032},${lon+.004})[railway=subway_entrance];node(${lat-.0032},${lon-.004},${lat+.0032},${lon+.004})[entrance];`).join('')+');out meta;';
await mkdir('.cache/osm',{recursive:true});
if(process.argv.includes('--refresh')){
 const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'ManiauLocalPrototype/0.2 (station entrance research; non-commercial local)'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(75000)});
 if(!response.ok)throw new Error('Overpass '+response.status);
 const raw=await response.text();const parsed=JSON.parse(raw);if(parsed.remark)throw new Error(parsed.remark);
 await writeFile('.cache/osm/entrances.json',raw);await writeFile('.cache/osm/entrances-meta.json',JSON.stringify({sourceUrl:'https://overpass-api.de/api/interpreter',retrievedAt:new Date().toISOString(),query},null,2));
}
const data=JSON.parse(await readFile('.cache/osm/entrances.json','utf8'));
for(const [id,lat,lon] of centres){
 const near=data.elements.filter(n=>Math.hypot((n.lat-lat)*111000,(n.lon-lon)*91000)<360);
 console.log(id,near.map(n=>({id:n.id,lat:n.lat,lon:n.lon,tags:n.tags})));
}
