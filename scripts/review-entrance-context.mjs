// Small, one-time OSM editing API reads for station-access review; never called by the app.
import{mkdir,writeFile,readFile}from'node:fs/promises';
const nodes=[6897564065,2563975998,5261546898];
await mkdir('.cache/osm/context',{recursive:true});
// Reinspect the saved, one-time research evidence. Updating uses read-only Overpass,
// not the OSM editing API; do not make the app depend on that editing service.
const fetchSave=async(_url,name)=>JSON.parse(await readFile('.cache/osm/context/'+name,'utf8'));
for(const id of nodes){const data=await fetchSave(`https://api.openstreetmap.org/api/0.6/node/${id}/ways.json`,id+'-ways.json');console.log(id,data.elements.map(e=>({id:e.id,tags:e.tags})));}
for(const[name,lat,lon]of[['gakuentoshi',34.6811,135.0582],['myohoji',34.6754,135.1108]]){const data=await fetchSave(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${lon-.0008},${lat-.0006},${lon+.0008},${lat+.0006}`,name+'-map.json');console.log(name,data.elements.filter(e=>e.tags&&(e.tags.highway||e.tags.building||e.tags.railway)).map(e=>({id:e.id,type:e.type,tags:e.tags,nodes:e.nodes})));}
