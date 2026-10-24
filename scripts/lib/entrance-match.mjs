// Match map facts to station/line IDs. Proximity alone is never sufficient.
export const normalizeStationName=value=>String(value??'').normalize('NFKC')
 .replace(/【[^】]*】(?:都営|都營)(?:浅草|三田|新宿|大江戸)線$/,'')
 .replace(/\([^)]*[)）]/g,'').replace(/[【<＜][^】>＞]*[】>＞]/g,'')
 .replace(/^(?:都営地下鉄|都営|都營地下鉄|JR\s+)/,'')
 .replace(/[\s・･]/g,'').replace(/ケ/g,'ヶ').replace(/(?:駅出入口|駅舎|駅|停留場)$/,'');
export function meters(a,b){const r=Math.PI/180,x=(a.lon-b.lon)*r*Math.cos((a.lat+b.lat)*r/2),y=(a.lat-b.lat)*r;return Math.hypot(x,y)*6371000;}
const operators={
 'JR東日本':['東日本旅客鉄道','JR東日本'], '小田急電鉄':['小田急電鉄'], '京急電鉄':['京浜急行電鉄','京急電鉄'],
 '相模鉄道':['相模鉄道'], '京王電鉄':['京王電鉄'], '東武鉄道':['東武鉄道'], '西武鉄道':['西武鉄道'],
 '東急電鉄':['東急電鉄','東京急行電鉄'], '東京都交通局':['東京都交通局','都営地下鉄','都営','都營','Toei'], 'とさでん交通':['とさでん交通','土佐電気鉄道']
};
const point=e=>e.type==='node'?e:e.center??(e.bounds?{lat:(e.bounds.minlat+e.bounds.maxlat)/2,lon:(e.bounds.minlon+e.bounds.maxlon)/2}:null);
export function containsPoint(geometry,p){
 if(!geometry||geometry.length<4||geometry[0]?.lat!==geometry.at(-1)?.lat||geometry[0]?.lon!==geometry.at(-1)?.lon)return false;
 let inside=false;
 for(let i=0,j=geometry.length-1;i<geometry.length;j=i++){
  const a=geometry[i],b=geometry[j];if(!a||!b)return false;
  if((a.lat>p.lat)!==(b.lat>p.lat)&&p.lon<(b.lon-a.lon)*(p.lat-a.lat)/(b.lat-a.lat)+a.lon)inside=!inside;
 }
 return inside;
}
const names=e=>['name:ja','name','alt_name','official_name'].flatMap(k=>String(e.tags?.[k]??'').split(';')).filter(Boolean).map(normalizeStationName);
const key=e=>`${e.type}/${e.id}`;
const unrestricted=t=>(!t.access||['yes','public','permissive','designated'].includes(t.access))
 &&(!t.foot||['yes','public','permissive','designated'].includes(t.foot))
 &&!t.opening_hours&&!t['access:conditional']&&!t['foot:conditional']&&!t['entrance:conditional']
 &&t.locked!=='yes'&&t.entry!=='no'&&(!t['oneway:foot']||t['oneway:foot']==='no');
export function publicEntrance(e,role=''){
 const t=e.tags??{};
 return e.type==='node'&&Number.isFinite(e.lat)&&Number.isFinite(e.lon)
  &&!/(exit_only|exit-only)/i.test(role)
  &&!['exit','emergency','service','no'].includes(t.entrance)
  &&unrestricted(t)
  &&!t.construction&&!t.disused&&!t['disused:railway']&&!t['disused:entrance']
  &&!/(出口専用|臨時|非常|閉鎖|工事|exit only|temporary|emergency|closed)/i.test([t.name,t['name:ja'],t.description,t.note].filter(Boolean).join(' '))
  &&(['subway_entrance','train_station_entrance'].includes(t.railway)||t.public_transport==='entrance'||['yes','main','staircase'].includes(t.entrance));
}
// Follow at most two mapped pedestrian ways, with a 150 m total limit. Only
// existing dedicated railway entrance nodes are destinations; platforms are proof.
function connection(entrance,targets,nodeWays,lookup){
 let frontier=[{node:entrance.id,distance:0,ways:[]}];
 const best=new Map([[entrance.id,0]]);
 for(let hop=0;hop<2;hop++){
  const next=[];
  for(const state of frontier)for(const way of nodeWays.get(state.node)??[]){
   if(state.ways.includes(way.id))continue;
   const from=way.nodes.indexOf(state.node);
   for(const sign of [-1,1]){
    let distance=state.distance;
    for(let i=from+sign;i>=0&&i<way.nodes.length;i+=sign){
     distance+=meters(way.geometry[i-sign],way.geometry[i]);if(distance>150)break;
     const id=way.nodes[i],node=lookup.get('node/'+id);
     if(node&&!unrestricted(node.tags??{}))break;
     if(targets.has(id))return {target:targets.get(id),ways:[...state.ways,way.id]};
     // Do not walk across another entrance to borrow its station association.
     if(node&&publicEntrance(node))break;
     if(distance<(best.get(id)??Infinity)){best.set(id,distance);next.push({node:id,distance,ways:[...state.ways,way.id]});}
    }
   }
  }
  frontier=next;
 }
 return null;
}
export function matchEntrances(stations,elements,checkedAt){
 const lookup=new Map(elements.map(e=>[key(e),e]));
 const usable=e=>unrestricted(e.tags??{})&&e.tags?.highspeed!=='yes'&&!String(e.tags?.network??'').includes('新幹線');
 const anchors=elements.filter(e=>usable(e)&&(e.tags?.railway==='station'||e.tags?.public_transport==='station'));
 const areas=elements.filter(e=>usable(e)&&e.tags?.public_transport==='stop_area');
 const buildings=elements.filter(e=>usable(e)&&e.type==='way'&&e.tags?.building==='train_station');
 const nodeWays=new Map();
 for(const e of elements)if(e.type==='way'&&/^(footway|steps|path|pedestrian)$/.test(e.tags?.highway??'')&&usable(e)&&!e.tags?.construction&&e.nodes?.length===e.geometry?.length&&e.geometry?.every(p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon))){
  for(const id of e.nodes){const ways=nodeWays.get(id)??[];ways.push(e);nodeWays.set(id,ways);}
 }
 const exitOnly=new Set(elements.filter(e=>e.tags?.public_transport==='stop_area').flatMap(e=>(e.members??[]).filter(m=>m.type==='node'&&/(exit_only|exit-only)/i.test(m.role)).map(m=>m.ref)));
 const candidates=elements.filter(e=>publicEntrance(e)&&!exitOnly.has(e.id));
 const entranceAreas=new Map();
 for(const area of areas)for(const member of area.members??[])if(member.type==='node'&&publicEntrance(lookup.get('node/'+member.ref)??{},member.role)){
  const list=entranceAreas.get(member.ref)??[];list.push(area);entranceAreas.set(member.ref,list);
 }
 const result=[],audit=[];
 for(const station of stations){
  const stationName=normalizeStationName(station.name);
  const nameMatch=e=>names(e).includes(stationName);
  const operatorMatch=e=>{
   const t=e.tags??{},identityName=[t.name,t['name:ja'],t.official_name].filter(Boolean).join(';');
   const explicit=[t.operator,t['operator:ja']].filter(Boolean).join(';');
   const matches=value=>(operators[station.operator]??[station.operator]).some(name=>value.includes(name));
   if(explicit)return matches(explicit);
   // network can be a line name, not an operator. A line label must not reject
   // an otherwise explicit stop_area membership. Known foreign operators still reject.
   const network=t.network??'';
   if(matches(network)||t['ref:'+station.operator])return true;
   if(Object.values(operators).flat().some(name=>network.includes(name))||/東京地下鉄|東京メトロ|横浜市交通局|京成電鉄|東京モノレール/.test(network))return false;
   if(/都営|都營|Toei/.test(identityName))return station.operator==='東京都交通局';
   if(/東京メトロ|東京地下鉄/.test(identityName))return false;
   if(/\(JR\)|^JR\s/.test(identityName))return station.operator==='JR東日本';
   return null;
  };
  const nearby=e=>point(e)&&meters(station,point(e))<650;
  const stationAnchors=anchors.filter(e=>nearby(e)&&nameMatch(e)&&operatorMatch(e)!==false);
  const stationAreas=areas.filter(e=>nearby(e)&&nameMatch(e)&&operatorMatch(e)!==false&&(
   operatorMatch(e)===true||(e.members??[]).some(m=>stationAnchors.some(a=>m.type===a.type&&m.ref===a.id))));
  const stationBuildings=buildings.filter(e=>nearby(e)&&operatorMatch(e)!==false&&(
   (nameMatch(e)&&!anchors.some(a=>point(a)&&containsPoint(e.geometry,point(a))&&operatorMatch(a)===false))
   ||stationAreas.some(a=>a.members?.some(m=>m.type==='way'&&m.ref===e.id))
   ||(!e.tags.name&&stationAnchors.some(a=>point(a)&&containsPoint(e.geometry,point(a))&&operatorMatch(a)===true))));
  const platforms=stationAreas.flatMap(a=>(a.members??[]).filter(m=>m.type==='way'&&m.role.includes('platform')).map(m=>lookup.get('way/'+m.ref)))
   .filter(p=>p&&usable(p)&&(p.tags?.railway==='platform'||p.tags?.public_transport==='platform')&&operatorMatch(p)!==false);
  const targets=new Map();
  for(const feature of [...platforms,...stationBuildings])for(const id of feature.nodes??[])targets.set(id,feature);
  for(const a of stationAnchors)if(a.type==='node')targets.set(a.id,a);
  const selected=[];
  for(const e of candidates){
   if(meters(station,e)>650||operatorMatch(e)===false)continue;
   // An explicitly assigned entrance of another operator/physical station cannot be borrowed.
   const owners=entranceAreas.get(e.id)??[];
   const area=stationAreas.find(a=>a.members?.some(m=>m.type==='node'&&m.ref===e.id&&publicEntrance(e,m.role)));
   const building=stationBuildings.find(b=>b.nodes?.includes(e.id)
    ||(e.tags.railway==='train_station_entrance'&&containsPoint(b.geometry,e)));
   const named=['subway_entrance','train_station_entrance'].includes(e.tags.railway)&&nameMatch(e)&&operatorMatch(e)!==false
    &&(operatorMatch(e)===true||!anchors.some(a=>point(a)&&meters(e,point(a))<650&&nameMatch(a)&&operatorMatch(a)===false));
   if(!area&&owners.length&&owners.every(a=>!stationAreas.includes(a)))continue;
   const path=!area&&!building&&!named&&['subway_entrance','train_station_entrance'].includes(e.tags.railway)
    ?connection(e,targets,nodeWays,lookup):null;
   if(!area&&!building&&!named&&!path)continue;
   // Unnamed buildings are only admitted through an explicit stop_area membership.
   const association=area?'stop-area':building?'station-building':named?'entrance-name':'station-footpath';
   const proof=area??building??(named?e:path.target);
   let name=e.tags['name:ja']||e.tags.name||'';
   if(normalizeStationName(name)===stationName)name='';
   if(e.tags.ref)name=name?`${name}（${e.tags.ref}）`:`${e.tags.ref}出入口`;
   if(!name)name=e.tags.highway==='elevator'?'エレベーター入口（地図登録地点）':'駅入口（地図登録地点）';
   selected.push({id:`osm-${e.id}-${station.id}`,stationId:station.id,name,lat:e.lat,lon:e.lon,
    sourceUrl:`https://www.openstreetmap.org/node/${e.id}`,checkedAt,
    note:`OpenStreetMapの${association==='stop-area'?'駅施設グループ':association==='station-building'?'駅舎上':association==='station-footpath'?'駅施設に接続する歩道上の鉄道':'駅名付き'}入口。構内・開閉状況は現地で確認してください。`,
    osm:{nodeId:e.id,association,feature:key(proof),featureUrl:`https://www.openstreetmap.org/${key(proof)}`,...(path?{paths:path.ways.map(id=>`way/${id}`)}:{})}});
  }
  // Disambiguate unnamed entries without inventing an official exit number.
  const counts=new Map();for(const e of selected)counts.set(e.name,(counts.get(e.name)??0)+1);
  for(const e of selected)if(counts.get(e.name)>1)e.name+=` · 地図ID ${e.osm.nodeId}`;
  selected.sort((a,b)=>a.osm.nodeId-b.osm.nodeId);result.push(...selected);
  audit.push({stationId:station.id,operator:station.operator,station:station.name,line:station.line,entranceCount:selected.length,anchors:stationAnchors.map(key),areas:stationAreas.map(key)});
 }
 return {entrances:result,audit};
}
