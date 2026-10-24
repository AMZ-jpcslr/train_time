// Match map facts to station/line IDs. Proximity alone is never sufficient.
export const normalizeStationName=value=>String(value??'').normalize('NFKC')
 .replace(/\([^)]*[)）]/g,'').replace(/[【<＜][^】>＞]*[】>＞]/g,'')
 .replace(/^(?:都営地下鉄|都営|都營地下鉄)/,'')
 .replace(/[\s・･]/g,'').replace(/ケ/g,'ヶ').replace(/(?:駅|停留場)$/,'');
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
export function matchEntrances(stations,elements,checkedAt){
 const lookup=new Map(elements.map(e=>[key(e),e]));
 const usable=e=>unrestricted(e.tags??{})&&e.tags?.highspeed!=='yes'&&!String(e.tags?.network??'').includes('新幹線');
 const anchors=elements.filter(e=>usable(e)&&(e.tags?.railway==='station'||e.tags?.public_transport==='station'));
 const areas=elements.filter(e=>usable(e)&&e.tags?.public_transport==='stop_area');
 const buildings=elements.filter(e=>usable(e)&&e.type==='way'&&e.tags?.building==='train_station');
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
   const t=e.tags??{},identityName=[t.name,t['name:ja']].filter(Boolean).join(';');
   const value=[t.operator,t['operator:ja'],t.network].filter(Boolean).join(';');
   if(!value&&/(都営|都營|Toei)/.test(identityName))return station.operator==='東京都交通局';
   if(!value&&/東京メトロ/.test(identityName))return false;
   if(!value&&/\(JR\)/.test(identityName))return station.operator==='JR東日本';
   if(!value)return null;
   return (operators[station.operator]??[station.operator]).some(name=>value.includes(name));
  };
  const nearby=e=>point(e)&&meters(station,point(e))<650;
  const stationAnchors=anchors.filter(e=>nearby(e)&&nameMatch(e)&&operatorMatch(e)!==false);
  const stationAreas=areas.filter(e=>nearby(e)&&nameMatch(e)&&operatorMatch(e)!==false&&(
   operatorMatch(e)===true||(e.members??[]).some(m=>stationAnchors.some(a=>m.type===a.type&&m.ref===a.id))));
  const stationBuildings=buildings.filter(e=>nearby(e)&&operatorMatch(e)!==false&&(
   (nameMatch(e)&&!anchors.some(a=>point(a)&&containsPoint(e.geometry,point(a))&&operatorMatch(a)===false))
   ||stationAreas.some(a=>a.members?.some(m=>m.type==='way'&&m.ref===e.id))
   ||(!e.tags.name&&stationAnchors.some(a=>point(a)&&containsPoint(e.geometry,point(a))&&operatorMatch(a)===true))));
  const selected=[];
  for(const e of candidates){
   if(meters(station,e)>650||operatorMatch(e)===false)continue;
   // An explicitly assigned entrance of another operator/physical station cannot be borrowed.
   const owners=entranceAreas.get(e.id)??[];
   const area=stationAreas.find(a=>a.members?.some(m=>m.type==='node'&&m.ref===e.id&&publicEntrance(e,m.role)));
   const building=stationBuildings.find(b=>b.nodes?.includes(e.id));
   const named=['subway_entrance','train_station_entrance'].includes(e.tags.railway)&&nameMatch(e)&&operatorMatch(e)!==false
    &&(operatorMatch(e)===true||!anchors.some(a=>point(a)&&meters(e,point(a))<650&&nameMatch(a)&&operatorMatch(a)===false));
   if(!area&&!building&&!named)continue;
   if(!area&&owners.length&&owners.every(a=>!stationAreas.includes(a)))continue;
   // Unnamed buildings are only admitted through an explicit stop_area membership.
   const association=area?'stop-area':building?'station-building':'entrance-name';
   const proof=area??building??e;
   let name=e.tags['name:ja']||e.tags.name||'';
   if(normalizeStationName(name)===stationName)name='';
   if(e.tags.ref)name=name?`${name}（${e.tags.ref}）`:`${e.tags.ref}出入口`;
   if(!name)name=e.tags.highway==='elevator'?'エレベーター入口（地図登録地点）':'駅入口（地図登録地点）';
   selected.push({id:`osm-${e.id}-${station.id}`,stationId:station.id,name,lat:e.lat,lon:e.lon,
    sourceUrl:`https://www.openstreetmap.org/node/${e.id}`,checkedAt,
    note:`OpenStreetMapの${association==='stop-area'?'駅施設グループ':association==='station-building'?'駅舎上':'駅名付き'}入口。構内・開閉状況は現地で確認してください。`,
    osm:{nodeId:e.id,association,feature:key(proof),featureUrl:`https://www.openstreetmap.org/${key(proof)}`}});
  }
  // Disambiguate unnamed entries without inventing an official exit number.
  const counts=new Map();for(const e of selected)counts.set(e.name,(counts.get(e.name)??0)+1);
  for(const e of selected)if(counts.get(e.name)>1)e.name+=` · 地図ID ${e.osm.nodeId}`;
  selected.sort((a,b)=>a.osm.nodeId-b.osm.nodeId);result.push(...selected);
  audit.push({stationId:station.id,operator:station.operator,station:station.name,line:station.line,entranceCount:selected.length,anchors:stationAnchors.map(key),areas:stationAreas.map(key)});
 }
 return {entrances:result,audit};
}
