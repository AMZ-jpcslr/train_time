import declaredScope from '../data/jr-scope.json' with {type:'json'};

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const label=value=>typeof value==='string'&&value.length>0&&value.length<=120&&value.trim()===value&&!/[\u0000-\u001f\u007f]/u.test(value);
const id=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(value);
function fields(value,names){if(!plain(value)||Object.keys(value).some(key=>!names.includes(key)))throw Error('JR scope contains unknown fields');}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

/** Source-controlled configuration only. A quality review is not a reuse permission. */
export function validateJrScope(value){
 fields(value,['schemaVersion','scopeVersion','operator','sourceOrigin','acquisitionScope','reusePermission','qualityReview','corridors','stations']);
 if(value.schemaVersion!==1||value.scopeVersion!==2||value.operator!=='JR西日本'||value.sourceOrigin!=='https://timetable.jr-odekake.net')throw Error('JR scope version/operator/source mismatch');
 // No environment variable or pending entry can silently authorize a new collection.
 if(value.acquisitionScope!=='existing'||value.reusePermission!=='unresolved-existing'||value.qualityReview!=='docs/jr-validation.json')throw Error('JR acquisition scope requires explicit review; reuse permission is unresolved');
 if(!Array.isArray(value.corridors)||!value.corridors.length||!Array.isArray(value.stations)||!value.stations.length)throw Error('JR scope cannot be empty');
 const corridors=new Map(),stationIds=new Set(),eids=new Set();
 for(const corridor of value.corridors){
  fields(corridor,['id','name']);
  if(!id(corridor.id)||!label(corridor.name)||corridors.has(corridor.id)||[...corridors.values()].includes(corridor.name))throw Error('JR corridor declaration invalid or duplicate');
  corridors.set(corridor.id,corridor.name);
 }
 const usedCorridors=new Set();
 for(const station of value.stations){
  fields(station,['id','name','eid','routes']);
  if(!id(station.id)||!station.id.startsWith('jr-')||!label(station.name)||typeof station.eid!=='string'||!/^\d{7}$/.test(station.eid)||stationIds.has(station.id)||eids.has(station.eid))throw Error('JR station declaration invalid or duplicate');
  stationIds.add(station.id);eids.add(station.eid);
  if(!Array.isArray(station.routes)||!station.routes.length)throw Error('JR station directions missing');
  const directions=new Set(),selectors=new Set();
  for(const route of station.routes){
   fields(route,['directionId','corridorId','sourceLine','direction']);
   if(!id(route.directionId)||!corridors.has(route.corridorId)||!label(route.sourceLine)||!label(route.direction)||directions.has(route.directionId))throw Error('JR direction declaration invalid or duplicate');
   const line=route.sourceLine.normalize('NFKC'),corridor=corridors.get(route.corridorId);
   if(line!==corridor&&line!==corridor+'(快速・普通)')throw Error('JR source line does not match its corridor');
   const selector=JSON.stringify([route.sourceLine,route.direction]);
   if(selectors.has(selector))throw Error('JR source selector duplicated');
   directions.add(route.directionId);selectors.add(selector);usedCorridors.add(route.corridorId);
  }
 }
 if(usedCorridors.size!==corridors.size)throw Error('JR corridor has no declared directions');
 return value;
}

export const JR_SCOPE=freeze(validateJrScope(declaredScope));
export const JR_SCOPE_VERSION=JR_SCOPE.scopeVersion;
// Preserve the collector's station/route ordering and tuple contract.
export const JR_STATIONS=freeze(JR_SCOPE.stations.map(station=>({id:station.id,name:station.name,eid:station.eid,routes:station.routes.map(route=>[route.directionId,route.sourceLine,route.direction])})));
export const JR_DIRECTIONS=freeze(JR_SCOPE.stations.flatMap(station=>station.routes.map(route=>({key:`${station.id}-${route.directionId}`,stationId:station.id,directionId:route.directionId,operator:JR_SCOPE.operator,line:route.sourceLine.normalize('NFKC'),direction:route.direction,corridorId:route.corridorId}))));

/** A fresh set for each response, so deletion during validation cannot mutate the manifest. */
export function expectedJrDirectionKeys(){return new Set(JR_DIRECTIONS.map(route=>route.key));}
/** Search catalog membership does not authorize timetable acquisition. */
export function isJrAcquisitionStation(stationId){return JR_STATIONS.some(station=>station.id===stationId);}
export function matchesJrDirection(table){
 if(!plain(table))return false;
 const route=JR_DIRECTIONS.find(item=>item.stationId===table.stationId&&item.directionId===table.directionId);
 return Boolean(route&&table.operator===route.operator&&table.line===route.line&&table.direction===route.direction);
}
