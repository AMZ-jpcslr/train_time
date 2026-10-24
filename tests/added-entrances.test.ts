import {describe,it,expect} from 'vitest';
import added from '../src/data/added-entrances.json';
import legacy from '../src/data/entrances.json';
import coverage from '../src/data/entrance-coverage.json';
// @ts-expect-error Offline importer shared with Node.
import {matchEntrances,publicEntrance,containsPoint,normalizeStationName} from '../scripts/lib/entrance-match.mjs';
// @ts-expect-error The production whitelist uses the same two data files as the client.
import {loadEntrances} from '../server/entrances.mjs';
// @ts-expect-error Offline review validation shared with Node.
import {applyOfficialReviews} from '../scripts/lib/official-entrance-reviews.mjs';
const station={id:'challenge-keio-0123456789abcdef',name:'検証',operator:'京王電鉄',line:'検証線',lat:35,lon:139};
const anchor={type:'node',id:1,lat:35,lon:139,tags:{railway:'station',name:'検証',operator:'京王電鉄'}};
const entrance={type:'node',id:2,lat:35.0001,lon:139.0001,tags:{railway:'train_station_entrance',ref:'北'}};
const area={type:'relation',id:3,center:{lat:35,lon:139},tags:{public_transport:'stop_area',name:'検証 (京王線)'},members:[{type:'node',ref:1,role:''},{type:'node',ref:2,role:''}]};
const match=(elements:unknown[],s=station)=>matchEntrances([s],elements,'2026-10-24T00:00:00Z').entrances;
describe('additional station access from independently sourced OSM facts',()=>{
 it('only assigns explicit stop-area membership and never borrows a nearby entrance',()=>{
  expect(match([anchor,entrance,area])).toHaveLength(1);
  expect(match([anchor,entrance])).toHaveLength(0);
  expect(match([anchor,entrance,{...area,members:[{type:'node',ref:1,role:''}]}])).toHaveLength(0);
 });
 it.each([
  {access:'private'},{access:'customers'},{foot:'no'},{entrance:'exit'},{entrance:'emergency'},{opening_hours:'07:00-23:00'},
  {'access:conditional':'yes @ (Mo-Fr)'},{construction:'yes'},{'disused:railway':'subway_entrance'},{name:'臨時出口'},{note:'closed for construction'},
  {access:'permit;yes'},{locked:'yes'},{entry:'no'},{'oneway:foot':'-1'},
 ])('excludes restricted/conditional entrances %j even inside a matched station group',tags=>{
  expect(match([anchor,{...entrance,tags:{...entrance.tags,...tags}},area])).toHaveLength(0);
 });
 it('excludes exit-only relation roles, other operators, distant points and malformed coordinates',()=>{
  expect(match([anchor,entrance,{...area,members:[{type:'node',ref:1,role:''},{type:'node',ref:2,role:'exit_only'}]}])).toHaveLength(0);
  expect(match([anchor,{...entrance,tags:{...entrance.tags,name:'検証'}},{...area,members:[{type:'node',ref:1,role:''},{type:'node',ref:2,role:'exit_only'}]}])).toHaveLength(0);
  expect(match([anchor,entrance,{...area,tags:{...area.tags,operator:'東京地下鉄'}}])).toHaveLength(0);
  expect(match([anchor,{...entrance,lat:36},area])).toHaveLength(0);
  expect(publicEntrance({...entrance,lat:NaN})).toBe(false);
 });
 it('requires a named matching station anchor inside an unnamed station building',()=>{
  const geometry=[{lat:34.999,lon:138.999},{lat:35.001,lon:138.999},{lat:35.001,lon:139.001},{lat:34.999,lon:139.001},{lat:34.999,lon:138.999}];
  const building={type:'way',id:4,bounds:{minlat:34.999,minlon:138.999,maxlat:35.001,maxlon:139.001},tags:{building:'train_station'},nodes:[2,8,9,2],geometry};
  expect(containsPoint(geometry,anchor)).toBe(true);expect(match([anchor,entrance,building])[0].osm.feature).toBe('way/4');
  expect(match([{...anchor,lon:139.005},entrance,building])).toHaveLength(0);
  expect(match([anchor,entrance,{...building,tags:{building:'retail'}}])).toHaveLength(0);
 });
 it('preserves operator prefixes that distinguish separate physical stations',()=>{
  expect(normalizeStationName('京急川崎')).not.toBe(normalizeStationName('川崎'));
  expect(normalizeStationName('浅草 (都営地下鉄浅草線)')).toBe('浅草');
  expect(normalizeStationName('西馬込【Ａ０１】都営浅草線')).toBe('西馬込');
  expect(normalizeStationName('浜田山駅出入口')).toBe('浜田山');
 });
 it('does not mistake a line-valued network for a foreign operator',()=>{
  expect(match([anchor,entrance,{...area,tags:{...area.tags,network:'井の頭線'}}])).toHaveLength(1);
  expect(match([anchor,entrance,{...area,tags:{...area.tags,network:'東京地下鉄'}}])).toHaveLength(0);
  expect(match([anchor,entrance,{...area,tags:{...area.tags,network:'井の頭線',operator:'東京地下鉄'}}])).toHaveLength(0);
 });
 it('uses an explicit footpath connection to a station platform without inventing an entrance',()=>{
  const platform={type:'way',id:40,tags:{railway:'platform'},nodes:[8,9]};
  const group={...area,members:[{type:'node',ref:1,role:''},{type:'way',ref:40,role:'platform'}]};
  const path={type:'way',id:41,tags:{highway:'footway'},nodes:[2,8],geometry:[entrance,{lat:35.0002,lon:139.0001}]};
  expect(match([anchor,entrance,group,platform,path])[0].osm).toMatchObject({association:'station-footpath',feature:'way/40',paths:['way/41']});
  expect(match([anchor,entrance,group,platform,{...path,nodes:[7,8]}])).toHaveLength(0);
  expect(match([anchor,entrance,group,platform,{...path,tags:{highway:'footway',access:'private'}}])).toHaveLength(0);
  expect(match([anchor,entrance,group,platform,{...path,geometry:[entrance,null]}])).toHaveLength(0);
  expect(match([anchor,entrance,group,platform,{...path,geometry:[entrance,{lat:35.003,lon:139}]}])).toHaveLength(0);
  expect(match([anchor,{...entrance,tags:{}},group,platform,path])).toHaveLength(0);
  const foreign={...area,id:50,tags:{...area.tags,operator:'東京地下鉄'},members:[{type:'node',ref:2,role:''}]};
  expect(match([anchor,entrance,group,platform,path,foreign])).toHaveLength(0);
 });
 it('includes the reviewed shared station and excludes its officially time-limited entrance',()=>{
  const reviewed=added.find(e=>e.osm.nodeId===2196837258&&e.osm.association==='official-shared-station');
  expect(reviewed).toBeTruthy();expect(reviewed?.name).toContain('2番');
  expect(added.some(e=>e.osm.nodeId===2196837257)).toBe(false);
 });
 it('refuses a changed or restricted source point in an individual official review',()=>{
  const item={station:station.name,operator:station.operator,line:station.line,nodeId:2,areaId:3,ref:'北',name:'公式照合入口',exitSourceUrl:'https://example.test/station',note:'fixture'};
  const review={checkedAt:'2026-10-25',associations:[item],excluded:[]};
  const result=applyOfficialReviews([station],[entrance,area],[],review);
  expect(result[0].name).toBe('公式照合入口');expect(Date.parse(result[0].checkedAt)).toBe(Date.parse('2026-10-25T00:00:00+09:00'));
  expect(()=>applyOfficialReviews([station],[{...entrance,tags:{...entrance.tags,access:'private'}},area],[],review)).toThrow(/rechecking/);
  expect(()=>applyOfficialReviews([], [entrance,area],[],review)).toThrow(/absent/);
 });
 it('keeps entrance IDs distinct for each line and the backend whitelist identical to the client',async()=>{
  const one=match([anchor,entrance,area])[0],two=match([anchor,entrance,area],{...station,id:'challenge-keio-fedcba9876543210'})[0];
  expect(one.id).not.toBe(two.id);
  const all=[...legacy,...added];expect(await loadEntrances()).toEqual(all);expect(new Set(all.map(e=>e.id)).size).toBe(all.length);
 });
 it('publishes traceable source points and accurate provider coverage without credentials or timetables',()=>{
  expect(added.length).toBeGreaterThan(1800);
  for(const e of added){
   expect(e.stationId).toMatch(/^(odpt-(?:toei|tosaden)|challenge-(?:jr-east|odakyu|keikyu|sotetsu|keio|tobu|seibu|tokyu))-[a-f0-9]{16}$/);
   expect(e.sourceUrl).toBe(`https://www.openstreetmap.org/node/${e.osm.nodeId}`);
   expect(e.osm.association).toMatch(/^(stop-area|station-building|entrance-name|station-footpath|official-shared-station)$/);
   expect(e.osm.featureUrl).toBe(`https://www.openstreetmap.org/${e.osm.feature}`);
   expect(e.lat).toBeGreaterThan(20);expect(e.lat).toBeLessThan(50);expect(e.lon).toBeGreaterThan(120);expect(e.lon).toBeLessThan(150);
   expect(Number.isFinite(Date.parse(e.checkedAt))).toBe(true);
  }
  const prefixes=['odpt-toei-','odpt-tosaden-','challenge-jr-east-','challenge-odakyu-','challenge-keikyu-','challenge-sotetsu-','challenge-keio-','challenge-tobu-','challenge-seibu-','challenge-tokyu-'];
  coverage.coverage.forEach((row,i)=>{const entries=added.filter(e=>e.stationId.startsWith(prefixes[i]));expect(entries.length).toBe(row.entranceCount);expect(new Set(entries.map(e=>e.stationId)).size).toBe(row.covered);expect(row.covered).toBeLessThanOrEqual(row.total);});
  expect(JSON.stringify(added)).not.toMatch(/consumerKey|ODPT_CHALLENGE_TOKEN|departureTime|stationTimetableObject/);
 });
});
