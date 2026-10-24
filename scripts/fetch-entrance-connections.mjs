// Offline, bounded Overpass batches; no calls are made by the application.
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fetchOsmEvidence} from './lib/fetch-osm-evidence.mjs';
await mkdir('.cache/osm/connections',{recursive:true});
// A fixed candidate manifest makes this release's source queries reproducible.
const {nodeIds:ids}=JSON.parse(await readFile('scripts/reviews/entrance-connection-ids.json','utf8'));
for(let offset=0;offset<ids.length;offset+=75){
 const region='batch-'+String(offset/75).padStart(2,'0'),query=`[out:json][timeout:30];
 node(id:${ids.slice(offset,offset+75).join(',')})->.e;
 way(bn.e)[highway~"^(footway|steps|path|pedestrian)$"]->.p1;
 node(w.p1)->.n1;
 way(bn.n1)[highway~"^(footway|steps|path|pedestrian)$"]->.p2;
 (.e;.p1;.p2;node(w.p1);node(w.p2););out body geom;`;
 const file=`.cache/osm/connections/${region}.json`;
 const exists=await access(file).then(()=>true,()=>false);
 if(process.argv.includes('--refresh')&&!exists){
  const endpoint='https://overpass-api.de/api/interpreter',url=new URL(endpoint);url.searchParams.set('data',query);
  const raw=await fetchOsmEvidence(url);
  await writeFile(file,raw);await writeFile(file.replace('.json','-meta.json'),JSON.stringify({sourceUrl:endpoint,retrievedAt:new Date().toISOString(),sha256:createHash('sha256').update(raw).digest('hex'),query},null,2)+'\n');
 }
 const data=JSON.parse(await readFile(file,'utf8'));console.log(JSON.stringify({region,elements:data.elements.length}));
 if(process.argv.includes('--first'))break;
}
