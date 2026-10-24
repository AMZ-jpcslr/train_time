// Fetch explicit platform members as association evidence, never as destinations.
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fetchOsmEvidence} from './lib/fetch-osm-evidence.mjs';
const {platformWayIds:ids}=JSON.parse(await readFile('scripts/reviews/entrance-connection-ids.json','utf8'));
await mkdir('.cache/osm/connections',{recursive:true});
for(let offset=0;offset<ids.length;offset+=300){
 const region='platforms-'+String(offset/300).padStart(2,'0'),file=`.cache/osm/connections/${region}.json`;
 const query=`[out:json][timeout:30];way(id:${ids.slice(offset,offset+300).join(',')});out body geom;`;
 if(process.argv.includes('--refresh')&&!await access(file).then(()=>true,()=>false)){
  const endpoint='https://overpass-api.de/api/interpreter',url=new URL(endpoint);url.searchParams.set('data',query);
  const raw=await fetchOsmEvidence(url);
  await writeFile(file,raw);await writeFile(file.replace('.json','-meta.json'),JSON.stringify({sourceUrl:endpoint,retrievedAt:new Date().toISOString(),sha256:createHash('sha256').update(raw).digest('hex'),query},null,2)+'\n');
 }
 console.log(JSON.stringify({region,elements:JSON.parse(await readFile(file,'utf8')).elements.length}));
}
