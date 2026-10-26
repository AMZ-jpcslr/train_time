/** Bounded official bulk CSV import. Original user-generated kobe-extra files are never changed. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCsv, serviceTime, SOURCE_SAMPLES, verifySamples, KOBE_CATALOG } from './import-municipal.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CACHE = path.join(ROOT, '.cache/kobe-expanded');
const OLD = path.join(ROOT, '.cache/west-expansion');
const CATALOG = 'https://catalog.city.kobe.lg.jp/api/3/action/package_show?id=f2d416e9-7dae-4938-b62e-7c717002d715';
const REVISION = '2025-03-15';
// Re-fetching unchanged CKAN bytes cannot renew the independent official-site review.
export const OFFICIAL_REVIEWED_AT = '2026-10-25T17:17:32.000Z';
const sha = data => createHash('sha256').update(data).digest('hex');
const json = data => JSON.stringify(data, null, 2) + '\n';
export const REVIEWED_HASHES = {
  'w-east': 'd1731678eca5d0f4eee5c790c2aa0e84217c54a00d74981077608974bf2c8e79',
  'w-west': '2055295d7001fa251b4a92f4547fd6ae3e8100b43519f4896c0509f7d3293574',
  'h-east': '16b85e9f0075f95b6495424ddfdb86aca9a0f3605b918dffd83981bf850dbd74',
  'h-west': '1ec26e0167e7387c0152d9ca760b1563c25856959f316078799de1c8a6b948f0',
};
const filename = key => `open_seishin_${key.replace('-', '_')}_r070315.csv`;
const names = ['谷上','新神戸','三宮','県庁前','大倉山','湊川公園','上沢','長田','新長田','板宿','妙法寺','名谷','総合運動公園','学園都市','伊川谷','西神南','西神中央'];
const oldIds = {'学園都市':'kobe-gakuentoshi','妙法寺':'kobe-myohoji'};

// Fixed independently read first/noon/last time + destination anchors. They are
// not derived from the converter under test. Source HTML was read via web search
// on 2026-10-26; this is a sample review, not an all-train second-source audit.
export const EXPANDED_SAMPLES = [
  ['新神戸','east','w',['05:46/谷上','12:12/谷上','24:07/谷上'], 'shinkobe'],
  ['新神戸','east','h',['05:45/谷上','12:12/谷上','24:07/谷上'], 'shinkobe'],
  ['新神戸','west','w',['05:26/西神中央','12:05/西神中央','24:32/西神中央'], 'shinkobe'],
  ['新神戸','west','h',['05:26/西神中央','12:05/西神中央','24:03/西神中央'], 'shinkobe'],
  ['県庁前','east','w',['05:40/谷上','12:07/谷上','24:33/新神戸'], 'kenchomae'],
  ['県庁前','east','h',['05:40/谷上','12:07/谷上','24:03/谷上'], 'kenchomae'],
  ['県庁前','west','w',['05:30/西神中央','12:01/西神中央','24:36/西神中央'], 'kenchomae'],
  ['県庁前','west','h',['05:30/西神中央','12:01/西神中央','24:07/西神中央'], 'kenchomae'],
  ['名谷','east','w',['05:23/谷上','12:04/谷上','24:14/新神戸'], 'myodani'],
  ['名谷','east','h',['05:23/谷上','12:04/谷上','23:44/谷上'], 'myodani'],
  ['名谷','west','w',['05:23/西神中央','12:05/西神中央','24:54/西神中央'], 'myodani'],
  ['名谷','west','h',['05:23/西神中央','12:05/西神中央','24:26/西神中央'], 'myodani'],
  ['谷上','west','w',['05:18/西神中央','12:12/西神中央','23:55/西神中央'], 'tanigami'],
];

export function validateNetwork(text) {
  const rows = parseCsv(text).map(row => row.map(cell => cell.replace(/[\r\n]/g, '')));
  if (rows[0]?.[0] !== '始発駅' || rows[1]?.[0] !== '行先駅') throw Error('Unexpected network header');
  const width = rows[0].length;
  if (width < 2 || rows.some(row => row.length !== width)) throw Error('Network column count mismatch');
  const stops = rows.slice(2), labels = stops.map(row => row[0]);
  if (new Set(labels).size !== labels.length) throw Error('Duplicate station row');
  for (let col = 1; col < width; col++) {
    const origin = labels.indexOf(rows[0][col]), destination = labels.indexOf(rows[1][col]);
    if (origin < 0 || destination <= origin) throw Error('Missing or reversed origin/destination');
    let previous = null;
    for (let row = 0; row < stops.length; row++) {
      const value = stops[row][col];
      if ((row >= origin && row <= destination) !== Boolean(value)) throw Error('Missing stop or time outside train route');
      if (value) {
        const time = serviceTime(value);
        if (previous && previous > time) throw Error('Train runs backwards in time');
        previous = time;
      }
    }
  }
  return rows;
}

export function stationDepartures(rows, name) {
  const matching = rows.slice(2).filter(row => row[0] === name);
  if (matching.length !== 1) throw Error('Missing or duplicate station');
  const departures = [], sourceColumns = [], excludedArrivalColumns = [];
  matching[0].slice(1).forEach((value, index) => {
    if (!value) return;
    const destination = rows[1][index + 1];
    if (destination === name) { excludedArrivalColumns.push(index + 2); return; }
    if (!destination) throw Error('Missing destination');
    departures.push({time:serviceTime(value),destination,trainType:null,platform:null});
    sourceColumns.push(index + 2);
  });
  if (new Set(departures.map(d => `${d.time}/${d.destination}`)).size !== departures.length) throw Error('Duplicate departure');
  if (departures.some((d,i) => i > 0 && d.time < departures[i-1].time)) throw Error('Unsorted departures');
  return {departures,sourceColumns,excludedArrivalColumns,sourceRow:rows.findIndex(row => row[0] === name)+1};
}

export function stationVariants(name, code) {
  if (code === 'S02') return [{id:'kobe-s02',line:'西神・山手線',directions:['west']},{id:'kobe-s02-hokushin',line:'北神線',directions:['east']}];
  return [{id:oldIds[name] ?? `kobe-${code.toLowerCase()}`,line:code === 'S01' ? '北神線' : '西神・山手線',directions:code === 'S01' ? ['west'] : code === 'S17' ? ['east'] : ['east','west']}];
}
function directionName(code, direction) {
  if (direction === 'east') return code === 'S02' ? '谷上方面' : code === 'S03' ? '新神戸・谷上方面' : Number(code.slice(1)) >= 13 ? '名谷・三宮・新神戸・谷上方面' : '三宮・新神戸・谷上方面';
  return Number(code.slice(1)) <= 2 ? '三宮・名谷・西神中央方面' : Number(code.slice(1)) <= 11 ? '名谷・西神中央方面' : '西神中央方面';
}
async function get(url) {
  const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
  if (response.status !== 200) throw Error(`Source HTTP ${response.status}; stopped without retry/bypass: ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 1_000_000) throw Error('Unexpected source size');
  return data;
}
export async function refreshSources() {
  const run = path.join(CACHE, new Date().toISOString().replace(/[:.]/g,'-'));
  await mkdir(run,{recursive:true});
  const raw = await get(CATALOG), catalog = JSON.parse(raw);
  if (!catalog.success || catalog.result.license_id !== 'cc-by') throw Error('Catalog or license changed; review required');
  await writeFile(path.join(run,'catalog.json'),raw);
  const resources = catalog.result.resources;
  for (const key of Object.keys(REVIEWED_HASHES)) {
    const matches = resources.filter(r => r.url.endsWith('/'+filename(key)));
    if (matches.length !== 1 || resources.some(r => /open_seishin_.*_r(\d+)\.csv$/.test(r.url) && r.url.match(/_r(\d+)\.csv$/)[1] > '070315')) throw Error('Catalog revision changed; review required');
    const resource = matches[0], data = await get(resource.url), retrievedAt = new Date().toISOString();
    await writeFile(path.join(run,filename(key)),data);
    await writeFile(path.join(run,filename(key)+'.meta.json'),json({sourceUrl:resource.url,retrievedAt,sha256:sha(data),resourceModified:resource.last_modified,catalogUrl:CATALOG}));
    if (sha(data) !== REVIEWED_HASHES[key]) throw Error(`Source changed: ${key}; new bytes retained in ${run}, no outputs updated`);
    await new Promise(resolve => setTimeout(resolve,1200));
  }
  await writeFile(path.join(CACHE,'latest.json'),json({directory:run}));
  return run;
}

export async function importKobeExpanded({refresh=false}={}) {
  const directory = refresh ? await refreshSources() : JSON.parse(await readFile(path.join(CACHE,'latest.json'),'utf8')).directory;
  const sources = {}, sourceEvidence = [];
  for (const key of Object.keys(REVIEWED_HASHES)) {
    const buffer = await readFile(path.join(directory,filename(key))), meta = JSON.parse(await readFile(path.join(directory,filename(key)+'.meta.json'),'utf8'));
    if (sha(buffer) !== REVIEWED_HASHES[key] || meta.sha256 !== sha(buffer) || !Number.isFinite(Date.parse(meta.retrievedAt))) throw Error('Source hash/provenance mismatch');
    const rows = validateNetwork(new TextDecoder('shift_jis',{fatal:true}).decode(buffer));
    if (rows.length !== 19 || names.some(name => !rows.some(r => r[0] === name))) throw Error('Unexpected station coverage');
    sources[key] = {rows,meta};
    sourceEvidence.push({key,...meta,revisionDate:REVISION,trainColumns:rows[0].length-1,stationRows:rows.length-2});
  }
  const checkedAt = OFFICIAL_REVIEWED_AT;
  const samples = EXPANDED_SAMPLES.map(([name,direction,day,expected,slug])=>{
    const parsed = stationDepartures(sources[`${day}-${direction}`].rows,name), keys = parsed.departures.map(d=>`${d.time}/${d.destination}`);
    if (keys[0] !== expected[0] || !keys.includes(expected[1]) || keys.at(-1) !== expected[2]) throw Error(`Independent HTML sample mismatch: ${name}/${day}/${direction}`);
    return {station:name,direction,day,expected,sourceUrl:`https://kotsu.city.kobe.lg.jp/subway/timetable1/${slug}/`,reviewDate:'2026-10-26',method:'Official HTML text via web search; first/noon/last times and destination symbols',matched:true};
  });
  const baseline = JSON.parse(await readFile(path.join(ROOT,'src/data/municipal.json'),'utf8'));
  const points = JSON.parse(await readFile(path.join(OLD,'kobe-station-centres.json'),'utf8')).elements;
  const addresses = parseCsv(new TextDecoder('shift_jis',{fatal:true}).decode(await readFile(path.join(OLD,'open_kobe_subway_add.csv')))).slice(1);
  const stations = [], tables = [], tableEvidence = [], baselineMatches = [];
  for (const [code,,stationName] of addresses.filter(row=>row[0].startsWith('S'))) {
    const name = stationName.replace(/駅$/,'').replace(/ケ/g,'ヶ');
    const candidates = points.filter(e=>e.type==='node' && e.tags?.name===name && (e.tags.station==='subway'||e.tags.subway==='yes') && (!e.tags.ref||e.tags.ref===code));
    const exact = candidates.filter(e=>e.tags.ref===code), nodes = exact.length ? exact : candidates;
    if (nodes.length !== 1) throw Error('Ambiguous coordinate: '+name);
    for (const variant of stationVariants(name,code)) {
      const station = {id:variant.id,name,operator:'神戸市営地下鉄',line:variant.line,code,lat:nodes[0].lat,lon:nodes[0].lon,region:'兵庫・神戸',directions:variant.directions.map(id=>({id,name:directionName(code,id)})),sourceUrl:'https://kotsu.city.kobe.lg.jp/subway/timetable/',coordinateSource:`https://www.openstreetmap.org/node/${nodes[0].id}`,physicalStationId:`kobe-${code.toLowerCase()}`};
      if (!oldIds[name]) stations.push(station);
      for (const day of ['w','h']) for (const direction of variant.directions) {
        const source = sources[`${day}-${direction}`], parsed = stationDepartures(source.rows,name);
        if (!parsed.departures.length) throw Error('Expected departures missing');
        const dayType = day === 'w' ? 'weekday' : 'weekend', id = `${station.id}-${direction}-${dayType}`;
        if (oldIds[name]) {
          verifySamples(parsed.departures,SOURCE_SAMPLES[`${day}-${direction}/${name}`]);
          const old = baseline.find(t=>t.id===id);
          if (!old || JSON.stringify(old.departures)!==JSON.stringify(parsed.departures)) throw Error('Existing municipal table differs: '+id);
          baselineMatches.push({id,count:parsed.departures.length,exactMatch:true});
          continue;
        }
        tables.push({id,stationId:station.id,operator:station.operator,line:station.line,directionId:direction,direction:directionName(code,direction),dayType,departures:parsed.departures,sourceUrl:source.meta.sourceUrl,retrievedAt:source.meta.retrievedAt,checkedAt,validFrom:REVISION,validTo:null,revisionDate:REVISION,verification:'verified',notes:[
          `神戸市交通局「地下鉄オープンデータ」を加工。CC BY 2.1 JP。${KOBE_CATALOG}`,
          'https://creativecommons.org/licenses/by/2.1/jp/',
          '検証：公式CSV全列の駅順・発着区間・空欄・時刻順・重複、既存2駅全便一致、および新神戸・名谷・県庁前・谷上の代表時刻を公式HTMLと照合。全駅全便の別資料突合ではありません。',
          '終着駅の到着時刻を除外。新神戸は西神・山手線を西行、北神線を東行に分けて重複を防止。0時台・1時台は前運行日の24時台・25時台。',
          '番線は未取得。駅代表座標はOpenStreetMap由来（ODbL）で、入口の位置ではありません。',
          '適用終了日は未公表。臨時ダイヤ・運休・遅延・特定日の例外は未反映。乗車の保証はできません。',
        ]});
        tableEvidence.push({tableId:id,physicalStationId:station.physicalStationId,sourceKey:`${day}-${direction}`,sourceRow:parsed.sourceRow,count:parsed.departures.length,sourceColumns:parsed.sourceColumns,excludedArrivalColumns:parsed.excludedArrivalColumns,first:parsed.departures[0],last:parsed.departures.at(-1)});
      }
    }
  }
  if (stations.length !== 16 || tables.length !== 56 || baselineMatches.length !== 8) throw Error('Unexpected coverage');
  // Archive only our own derived outputs. No writes to the pre-existing extra files.
  const outputs = ['src/data/kobe-expanded-stations.json','src/data/kobe-expanded.json','docs/kobe-expansion-20261026-validation.json'];
  const existing = (await Promise.all(outputs.map(async p=>{try{await readFile(path.join(ROOT,p));return p;}catch(e){if(e.code==='ENOENT')return null;throw e;}}))).filter(Boolean);
  if (existing.length) {
    const archive = path.join(CACHE,'output-history',new Date().toISOString().replace(/[:.]/g,'-'));
    await mkdir(archive,{recursive:true});
    for (const file of existing) await copyFile(path.join(ROOT,file),path.join(archive,path.basename(file)));
  }
  const report = {checkedAt,reviewDate:'2026-10-26',sourceLicense:'CC BY 2.1 JP',coordinateLicense:'ODbL',revisionDate:REVISION,validFrom:REVISION,validTo:null,extraStationLines:stations.length,extraPhysicalStations:new Set(stations.map(s=>s.physicalStationId)).size,extraTables:tables.length,extraDepartures:tables.reduce((n,t)=>n+t.departures.length,0),networkStationLines:18,networkPhysicalStations:17,networkTables:64,baselineMatches,sources:sourceEvidence,samples,tables:tableEvidence,limitations:['Official catalog HTML direct fetch returned 403/202 challenge; no bypass. Official indexed HTML identifies 2025-03-15 revision; live CKAN bulk bytes match reviewed hashes.','Verification includes full structural checks and fixed independent samples, not second-source comparison of every train.','PDF search text showed a Kenchomae minute discrepancy; official HTML matches CSV. PDF extraction was not trusted for corrections.','Kaigan cached CSV disagrees with 2026-03-14 current timetable; not imported.']};
  await writeFile(path.join(ROOT,outputs[0]),json(stations));
  await writeFile(path.join(ROOT,outputs[1]),JSON.stringify(tables)+'\n');
  await writeFile(path.join(ROOT,outputs[2]),json(report));
  console.log(JSON.stringify({stations:stations.length,physicalStations:report.extraPhysicalStations,tables:tables.length,departures:report.extraDepartures,checkedAt}));
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) importKobeExpanded({refresh:process.argv.includes('--refresh')}).catch(error=>{console.error(error);process.exitCode=1;});
