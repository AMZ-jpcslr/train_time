/** Offline, reviewed search metadata only. Never creates timetables or entrances. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const BASELINE = Object.freeze({ 大阪:'jr-osaka', 西宮:'jr-nishinomiya', 茨木:'jr-ibaraki', 南草津:'jr-minamikusatsu' });
const ROUTES = { kobe:'JR神戸線', kyoto:'JR京都線', biwako:'琵琶湖線' };
const SOURCE_ROUTES = new Set(['東海道線','山陽線','北陸線']);
const BRANCHES = new Set(['福島','和田岬']);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const featureDigest = features => digest(features.map(canonical).sort());
function requireCondition(condition, message) { if (!condition) throw new Error(message); }

export function generateCatalog(source, review) {
  requireCondition(source?.type==='FeatureCollection' && Array.isArray(source.features), 'GeoJSON FeatureCollection required');
  requireCondition(review?.schemaVersion===1 && review.status==='reviewed-station-membership-only', 'Human membership review required');
  requireCondition(Number.isFinite(Date.parse(review.checkedAt)), 'Fixed checkedAt required');
  const provenance=source.provenance;
  requireCondition(provenance?.license==='CC BY 4.0' && provenance.dataAsOf===review.sourceDataAsOf, 'Source license/date mismatch');
  requireCondition(provenance.originalGeoJsonSha256===review.sourceGeoJsonSha256 && provenance.archiveSha256===review.sourceArchiveSha256, 'Source provenance mismatch');
  requireCondition(Number.isFinite(Date.parse(provenance.retrievedAt)), 'Source retrieval date required');
  requireCondition(canonical(review.baselinePreserved.map(x=>[x.name,x.id]).sort())===canonical(Object.entries(BASELINE).sort()), 'Baseline identity mismatch');
  requireCondition(review.routes.length===3 && new Set(review.routes.map(r=>r.slug)).size===3, 'Three reviewed routes required');
  const names=new Set();
  for (const route of review.routes) {
    requireCondition(ROUTES[route.slug]===route.name, 'Route slug/name mismatch');
    requireCondition(Array.isArray(route.stationNames) && new Set(route.stationNames).size===route.stationNames.length, 'Duplicate route station');
    requireCondition(route.stationNames.length===review.expectedCounts.routeCounts[route.name], 'Membership count mismatch');
    route.stationNames.forEach(name=>{requireCondition(typeof name==='string' && !BRANCHES.has(name), 'Excluded branch in membership');names.add(name);});
  }
  const features=source.features.filter(f=>f?.properties?.N02_004==='西日本旅客鉄道' && SOURCE_ROUTES.has(f.properties.N02_003) && names.has(f.properties.N02_005));
  requireCondition(features.length===review.expectedCounts.sourceFeatures, 'Feature count mismatch');
  requireCondition(featureDigest(features)===review.selectedFeatureSha256, 'Reviewed feature hash mismatch');
  const seen=new Set(), groups=new Map(), codeNames=new Map();
  for (const feature of features) {
    const p=feature.properties, key=canonical(feature);
    requireCondition(!seen.has(key), 'Exact duplicate feature');seen.add(key);
    requireCondition(p.N02_001==='11' && p.N02_002==='2', 'Wrong railway/operator type');
    requireCondition(/^\d{6}$/.test(p.N02_005c) && /^\d{6}$/.test(p.N02_005g), 'Invalid source station code');
    requireCondition(!codeNames.has(p.N02_005c) || codeNames.get(p.N02_005c)===p.N02_005, 'Code maps to multiple names');codeNames.set(p.N02_005c,p.N02_005);
    requireCondition(feature.geometry?.type==='LineString' && feature.geometry.coordinates.length>=2, 'Station LineString required');
    for (const c of feature.geometry.coordinates) requireCondition(c.length===2 && c.every(Number.isFinite) && c[0]>=134 && c[0]<=137 && c[1]>=34 && c[1]<=36, 'Invalid/out-of-region coordinates');
    if(!groups.has(p.N02_005)) groups.set(p.N02_005,[]);
    groups.get(p.N02_005).push(feature);
  }
  requireCondition(groups.size===names.size && names.size===review.expectedCounts.physicalStationCandidates, 'Missing station');
  const duplicates=Object.fromEntries([...groups].filter(([,fs])=>fs.length>1).map(([name,fs])=>[name,fs.length]));
  requireCondition(canonical(duplicates)===canonical(review.duplicateGeometryStations), 'Unreviewed duplicate geometry');
  const result=[];
  for(const route of review.routes) for(const name of route.stationNames) {
    if(BASELINE[name]) continue;
    const fs=[...groups.get(name)].sort((a,b)=>canonical(a).localeCompare(canonical(b))), codes=[...new Set(fs.map(f=>f.properties.N02_005c))].sort(), coords=fs.flatMap(f=>f.geometry.coordinates);
    const lon=coords.reduce((n,c)=>n+c[0],0)/coords.length, lat=coords.reduce((n,c)=>n+c[1],0)/coords.length;
    result.push({id:`jr-catalog-${codes[0]}-${route.slug}`,physicalStationId:`jr-catalog-${codes[0]}`,name:name.startsWith('JR')?name:`JR${name}`,sourceStationName:name,aliases:[name],operator:'JR西日本',line:route.name,code:'JR',region:'関西',lat,lon,directions:[{id:'unavailable',name:'方面は未対応'}],directionNote:'内部の未対応表示用。実在する列車方面を表すものではありません。',sourceUrl:'https://www.jr-odekake.net/',catalogOnly:true,coordinateKind:'station-representative-not-entrance',sourceStationCodes:codes,catalogSource:{name:provenance.name,url:provenance.url,license:provenance.license,dataAsOf:provenance.dataAsOf,retrievedAt:provenance.retrievedAt,checkedAt:review.checkedAt}});
  }
  requireCondition(new Set(result.map(s=>s.id)).size===result.length,'Duplicate output ID');
  return result;
}

export function diffCatalog(before, after) {
  const previous=new Map(before.map(s=>[s.id,s])), next=new Map(after.map(s=>[s.id,s]));
  return {added:after.filter(s=>!previous.has(s.id)).map(s=>({id:s.id,name:s.name,line:s.line})),removed:before.filter(s=>!next.has(s.id)).map(s=>({id:s.id,name:s.name,line:s.line})),changed:after.filter(s=>previous.has(s.id)&&canonical(previous.get(s.id))!==canonical(s)).map(s=>({id:s.id,before:previous.get(s.id),after:s}))};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2), get=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
  const sourcePath=resolve(ROOT,get('--source','docs/jr-station-catalog-source-20261026.json'));
  const reviewPath=resolve(ROOT,get('--review','docs/jr-station-catalog-review-20261026.json'));
  const output=resolve(ROOT,get('--output','src/data/jr-station-catalog.json'));
  const diffPath=resolve(ROOT,get('--diff','docs/jr-station-catalog-diff-20261026.json'));
  const parse=p=>JSON.parse(readFileSync(p,'utf8'));
  const source=parse(sourcePath), review=parse(reviewPath), generated=generateCatalog(source,review);
  const before=existsSync(output)?parse(output):[];
  const report={reviewCheckedAt:review.checkedAt,sourceFeatureSha256:review.selectedFeatureSha256,count:generated.length,physicalStationCount:new Set(generated.map(s=>s.physicalStationId)).size,...diffCatalog(before,generated)};
  // Re-running unchanged inputs neither renews review dates nor erases the original change report.
  if(report.added.length || report.removed.length || report.changed.length || !existsSync(diffPath)) writeFileSync(diffPath,JSON.stringify(report,null,2)+'\n');
  writeFileSync(output,JSON.stringify(generated,null,2)+'\n');
  console.log(JSON.stringify({count:report.count,physicalStationCount:report.physicalStationCount,added:report.added.length,removed:report.removed.length,changed:report.changed.length,checkedAt:review.checkedAt}));
}
