import { describe, expect, it } from 'vitest';
// @ts-expect-error Shared native Node offline importer
import { generateCatalog, featureDigest, diffCatalog, BASELINE } from '../scripts/import-jr-station-catalog.mjs';
import source from '../docs/jr-station-catalog-source-20261026.json';
import review from '../docs/jr-station-catalog-review-20261026.json';
import catalog from '../src/data/jr-station-catalog.json';
import { stations } from '../src/data/stations';

const copy = <T,>(value:T):T => structuredClone(value);
describe('JR official station search catalog',()=>{
  it('reproduces 74 line records and 73 physical stations from 87 preserved features',()=>{
    expect(source.features).toHaveLength(87);
    expect(featureDigest(source.features)).toBe(review.selectedFeatureSha256);
    expect(generateCatalog(source,review)).toEqual(catalog);
    expect(catalog).toHaveLength(74);
    expect(new Set(catalog.map(s=>s.physicalStationId)).size).toBe(73);
    expect(catalog.filter(s=>s.line==='JR神戸線')).toHaveLength(37);
    expect(catalog.filter(s=>s.line==='JR京都線')).toHaveLength(15);
    expect(catalog.filter(s=>s.line==='琵琶湖線')).toHaveLength(22);
  });
  it('keeps existing four station IDs, coordinates, directions and source links',()=>{
    const expected=[
      ['jr-osaka',34.7025,135.4959,'0610130','京都・草津方面','三ノ宮・姫路方面'],
      ['jr-nishinomiya',34.7388,135.3474,'0610136','大阪・京都方面','三ノ宮・姫路方面'],
      ['jr-ibaraki',34.815,135.562,'0610124','京都・草津方面','大阪・三ノ宮方面'],
      ['jr-minamikusatsu',35.0037,135.9476,'0610149','草津・米原方面','京都・大阪方面'],
    ];
    for(const [id,lat,lon,sourceId,east,west] of expected){
      const station=stations.find(s=>s.id===id)!;
      expect(station).toMatchObject({lat,lon,sourceUrl:`https://eki.jr-odekake.net/top?id=${sourceId}`,directions:[{id:'east',name:east},{id:'west',name:west}]});
    }
    expect(catalog.some(s=>Object.keys(BASELINE).includes(s.sourceStationName))).toBe(false);
  });
  it('uses stable codes and shares Kyoto physical identity across its two memberships',()=>{
    const kyoto=catalog.filter(s=>s.sourceStationName==='京都');
    expect(kyoto).toHaveLength(2);
    expect(new Set(kyoto.map(s=>s.physicalStationId)).size).toBe(1);
    for(const s of catalog) expect(s.id).toMatch(/^jr-catalog-\d{6}-(kobe|kyoto|biwako)$/);
    const shuffled=copy(source);shuffled.features.reverse();
    expect(generateCatalog(shuffled,review)).toEqual(catalog);
  });
  it('cannot represent a timetable, boarding judgment, entrance or real direction',()=>{
    for(const s of catalog){
      expect(s.catalogOnly).toBe(true);
      expect(s.coordinateKind).toBe('station-representative-not-entrance');
      expect(s.code).toBe('JR');
      expect(s.directions).toEqual([{id:'unavailable',name:'方面は未対応'}]);
      expect(s).not.toHaveProperty('departures');expect(s).not.toHaveProperty('entrances');expect(s).not.toHaveProperty('timetablePath');
      expect(s.catalogSource.checkedAt).toBe(review.checkedAt);
      expect(s.catalogSource.dataAsOf).toBe('2025-12-31');
    }
  });
  it('excludes Fukushima and Wadamisaki even when present in a larger raw input',()=>{
    const extended=copy(source);
    for(const name of ['福島','和田岬']) {const f=copy(source.features[0]);f.properties.N02_005=name;extended.features.push(f);}
    expect(generateCatalog(extended,review)).toEqual(catalog);
    const bad=copy(review);bad.routes[0].stationNames[0]='福島';
    expect(()=>generateCatalog(source,bad)).toThrow('Excluded branch');
  });
  it('stops on source changes, missing geometry, unreviewed duplicates and invalid coordinates',()=>{
    const changed=copy(source);changed.features[0].geometry.coordinates[0][0]+=0.01;
    expect(()=>generateCatalog(changed,review)).toThrow('hash');
    const missing=copy(source);missing.features.pop();expect(()=>generateCatalog(missing,review)).toThrow('count');
    const duplicate=copy(source);duplicate.features[1]=copy(duplicate.features[0]);
    const duplicateReview={...review,selectedFeatureSha256:featureDigest(duplicate.features)};
    expect(()=>generateCatalog(duplicate,duplicateReview)).toThrow('duplicate');
    const invalid=copy(source);invalid.features[0].geometry.coordinates[0][0]=0;
    expect(()=>generateCatalog(invalid,{...review,selectedFeatureSha256:featureDigest(invalid.features)})).toThrow('coordinates');
    const dupReview={...review,duplicateGeometryStations:{...review.duplicateGeometryStations,大阪:6}};
    expect(()=>generateCatalog(source,dupReview)).toThrow('duplicate geometry');
  });
  it('requires review metadata and rejects missing or duplicate route membership',()=>{
    expect(()=>generateCatalog(source,{...review,status:'unreviewed'})).toThrow('review');
    expect(()=>generateCatalog(source,{...review,checkedAt:null})).toThrow('checkedAt');
    const bad=copy(review);bad.routes[0].stationNames[1]=bad.routes[0].stationNames[0];
    expect(()=>generateCatalog(source,bad)).toThrow('Duplicate route');
    expect(()=>generateCatalog(source,{...review,sourceGeoJsonSha256:'wrong'})).toThrow('provenance');
  });
  it('reports added, removed and changed entries without renewing dates',()=>{
    expect(diffCatalog(catalog,generateCatalog(source,review))).toEqual({added:[],removed:[],changed:[]});
    const changed=copy(catalog);changed[0].lat+=0.01;
    expect(diffCatalog(catalog,changed).changed).toHaveLength(1);
    expect(diffCatalog([],catalog).added).toHaveLength(74);
    expect(diffCatalog(catalog,[]).removed).toHaveLength(74);
  });
});
