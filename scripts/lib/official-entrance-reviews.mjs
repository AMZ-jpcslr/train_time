import {publicEntrance,meters} from './entrance-match.mjs';
export function applyOfficialReviews(stations,elements,entrances,review){
 const excluded=new Set(review.excluded.map(e=>e.nodeId));
 const result=entrances.filter(e=>!excluded.has(e.osm.nodeId));
 for(const item of review.associations){
  const node=elements.find(e=>e.type==='node'&&e.id===item.nodeId);
  const area=elements.find(e=>e.type==='relation'&&e.id===item.areaId);
  if(!node||!publicEntrance(node)||node.tags.ref!==item.ref||!area?.members?.some(m=>m.type==='node'&&m.ref===node.id&&!/exit_only|exit-only/.test(m.role??'')))throw Error('Official review needs rechecking: '+item.station);
  const matches=stations.filter(s=>s.name===item.station&&s.operator===item.operator&&s.line===item.line);
  if(!matches.length)throw Error('Reviewed station is absent from catalog: '+item.station);
  for(const station of matches){
   if(meters(station,node)>650||excluded.has(node.id))throw Error('Invalid reviewed station entrance');
   if(result.some(e=>e.stationId===station.id&&e.osm.nodeId===node.id))continue;
   result.push({id:`osm-${node.id}-${station.id}`,stationId:station.id,name:item.name,lat:node.lat,lon:node.lon,
    sourceUrl:`https://www.openstreetmap.org/node/${node.id}`,checkedAt:review.checkedAt+'T00:00:00+09:00',officialSourceUrl:item.exitSourceUrl,
    note:item.note,osm:{nodeId:node.id,association:'official-shared-station',feature:'relation/'+area.id,featureUrl:`https://www.openstreetmap.org/relation/${area.id}`}});
  }
 }
 return result;
}
