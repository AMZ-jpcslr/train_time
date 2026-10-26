/** Kaigan bulk CSV converter. Original inputs and earlier Kobe importers are never modified. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCsv } from './import-municipal.mjs';
import { validateNetwork, stationDepartures } from './import-kobe-expanded.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const REVISION = '2026-03-14';
export const CATALOG = 'https://kotsu.city.kobe.lg.jp/company/overview/open-data/subway-opendata/';
export const KEYS = ['w-east','w-west','h-east','h-west'];
export const NAMES = ['三宮・花時計前','旧居留地・大丸前','みなと元町','ハーバーランド','中央市場前','和田岬','御崎公園','苅藻','駒ヶ林','新長田'];
export const SOURCE_URLS = Object.fromEntries(KEYS.map(key=>[key,`https://kotsu.city.kobe.lg.jp/wp-content/uploads/open_kaigan_${key.replace('-','_')}_r080314.csv`]));
export const LOCAL_HASH = 'a671284c499450cd336fa72d44ba644efd1c078b691fc30e518dfcb7f822bf40';
export const REVIEWED_AT = '2026-10-26T02:45:00.000Z';
export const INDEPENDENT_REVIEW_SHA = '1fb9133d91561e08a8e6cc3913f73833ef6f0e2f1f0a7f72f00aea3ff4e30a54';
export const STATION_SLUGS = ['sannomiya-hanadokeimae','kyukyoryuchi-daimarumae/','minatomotomachi/','harborland/','chuoichibamae/','wadamisaki/','misakikoen/','karumo/','komagabayashi/','k-shinnagata/'];
const sha = b=>createHash('sha256').update(b).digest('hex');
const json = x=>JSON.stringify(x,null,2)+'\n';
const quote = cell=>'"'+cell.replace(/"/g,'""')+'"';

export function kaiganNetwork(text, direction) {
  if (!['east','west'].includes(direction)) throw Error('Unknown Kaigan direction');
  const original = parseCsv(text).map(r=>r.map(c=>c.replace(/[\r\n]/g,'')));
  const width = original[0]?.length;
  if (!width || original.some(r=>r.length!==width)) throw Error('Kaigan column count mismatch');
  // The current official CSV has an entirely blank spacer column. Never drop a
  // partially populated column, which would conceal a missing origin/destination.
  const keep = Array.from({length:width},(_,i)=>i).filter(i=>i===0||original.some(r=>r[i]!==''));
  const excludedBlankColumns = Array.from({length:width},(_,i)=>i+1).filter(i=>!keep.includes(i-1));
  const rows = validateNetwork(original.map(r=>keep.map(i=>quote(r[i])).join(',')).join('\n'));
  const expected = direction==='west' ? NAMES : [...NAMES].reverse();
  if (JSON.stringify(rows.slice(2).map(r=>r[0]))!==JSON.stringify(expected)) throw Error('Unexpected Kaigan station order');
  return {rows,originalColumnNumbers:keep.map(i=>i+1),excludedBlankColumns};
}

export function kaiganDepartures(network,name) {
  const result = stationDepartures(network.rows,name);
  return {...result,sourceColumns:result.sourceColumns.map(n=>network.originalColumnNumbers[n-1]),excludedArrivalColumns:result.excludedArrivalColumns.map(n=>network.originalColumnNumbers[n-1])};
}

// Independently read from official HTML, not produced by the CSV converter.
export const SAMPLES = [
  {name:'中央市場前',slug:'chuoichibamae',first:'05:44',noon:['12:11','12:26','12:41','12:56'],last:'23:54'},
  {name:'御崎公園',slug:'misakikoen',first:'05:40',noon:['12:07','12:22','12:37','12:52'],last:'23:50'},
  {name:'旧居留地・大丸前',slug:'kyukyoryuchi-daimarumae',first:'05:50',noon:['12:02','12:17','12:32','12:47'],last:'24:00'},
];
export function verifyCurrentEast(network) {
  return SAMPLES.map(s=>{
    const ds=kaiganDepartures(network,s.name).departures;
    if(ds[0]?.time!==s.first||ds.at(-1)?.time!==s.last||JSON.stringify(ds.filter(d=>d.time.startsWith('12:')).map(d=>d.time))!==JSON.stringify(s.noon)||ds.some(d=>d.destination!=='三宮・花時計前')) throw Error('Current HTML sample mismatch: '+s.name);
    return {...s,sourceUrl:`https://kotsu.city.kobe.lg.jp/subway/timetable1/${s.slug}/`,reviewedAt:REVIEWED_AT,matched:true,method:'Official HTML extracted text; first, all noon departures, last, destination legend; not all trains'};
  });
}

export function coverageRows(availableKeys=[]) {
  if(availableKeys.some(k=>!KEYS.includes(k))) throw Error('Unknown source key');
  return NAMES.flatMap((name,i)=> (i===0?['west']:i===9?['east']:['east','west']).flatMap(direction=>['w','h'].map(day=>({stationId:`kobe-k${String(i+1).padStart(2,'0')}`,name,direction,dayType:day==='w'?'weekday':'weekend',currentCsvAvailable:availableKeys.includes(`${day}-${direction}`),verification:availableKeys.includes(`${day}-${direction}`)?'partial':'missing',dailyValidity:false,boardingDecision:false}))));
}

export function diffDepartures(oldNetwork,newNetwork) {
  return NAMES.map(name=>{
    const old=kaiganDepartures(oldNetwork,name).departures.map(d=>`${d.time}/${d.destination}`),current=kaiganDepartures(newNetwork,name).departures.map(d=>`${d.time}/${d.destination}`);
    return {name,oldCount:old.length,currentCount:current.length,removed:old.filter(d=>!current.includes(d)),added:current.filter(d=>!old.includes(d))};
  });
}

export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const FAILURE_PREFIX_BYTES = 4096;
const RESPONSE_HEADERS = ['content-type','content-length','date','server','location','x-amzn-waf-action'];

async function boundedBody(response,limit) {
  if(!response.body) return {bytes:Buffer.alloc(0),truncated:false};
  const reader=response.body.getReader(),parts=[];
  let retained=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();
      if(done) return {bytes:Buffer.concat(parts,retained),truncated:false};
      const remaining=limit-retained;
      if(value.byteLength>remaining) {
        if(remaining) parts.push(Buffer.from(value.subarray(0,remaining)));
        retained+=remaining;
        await reader.cancel();
        return {bytes:Buffer.concat(parts,retained),truncated:true};
      }
      parts.push(Buffer.from(value));retained+=value.byteLength;
    }
  } finally {reader.releaseLock();}
}

/** Normal public GET, no redirects, bounded streaming body; stop on first failure. */
export async function acquireCurrent({fetcher=fetch,directory=path.join(ROOT,'.cache/kobe-kaigan-followup',new Date().toISOString().replace(/[:.]/g,'-')),saveFile}={}) {
  const save=saveFile??(async (filename,bytes)=>{
    await mkdir(directory,{recursive:true});
    await writeFile(filename,bytes);
  });
  for(const key of KEYS) {
    const response=await fetcher(SOURCE_URLS[key],{redirect:'manual',signal:AbortSignal.timeout(30000)});
    const responseAllowed=response.status===200&&!response.headers.get('x-amzn-waf-action');
    const body=await boundedBody(response,responseAllowed?MAX_SOURCE_BYTES:FAILURE_PREFIX_BYTES);
    const bytes=body.bytes,retrievedAt=new Date().toISOString();
    const filename=path.basename(SOURCE_URLS[key]);
    const accepted=responseAllowed&&!body.truncated&&bytes.length>0;
    const savedBody=accepted?bytes:bytes.subarray(0,FAILURE_PREFIX_BYTES);
    const headers=Object.fromEntries(RESPONSE_HEADERS.flatMap(name=>response.headers.has(name)?[[name,response.headers.get(name).slice(0,2048)]]:[]));
    await save(path.join(directory,filename+(accepted?'':'.response.bin')),savedBody);
    await save(path.join(directory,filename+'.meta.json'),json({sourceUrl:SOURCE_URLS[key],retrievedAt,status:response.status,location:headers.location??null,headers,accepted,sha256:sha(savedBody),hashScope:body.truncated||savedBody.length<bytes.length?'retained-prefix':'complete-response',bytes:savedBody.length,retainedBytesBeforePrefix:bytes.length,truncated:body.truncated||savedBody.length<bytes.length,maxSourceBytes:MAX_SOURCE_BYTES}));
    if(!accepted) throw Error(`Current source unavailable: HTTP ${response.status}, ${bytes.length} retained bytes${body.truncated?', body limit exceeded':''}. Evidence: ${directory}. No redirect, retry or challenge bypass.`);
    kaiganNetwork(new TextDecoder('shift_jis',{fatal:true}).decode(bytes),key.split('-')[1]);
  }
  console.log(`Inputs saved in ${directory}; review hashes, source revision and independent samples before integration.`);
}

export async function buildLocalCandidate() {
  const cache=path.join(ROOT,'.cache/kobe-kaigan-followup/local-original');
  const bytes=await readFile(path.join(cache,'open_kaigan_w_east_r080314.csv'));
  if(sha(bytes)!==LOCAL_HASH) throw Error('Local source changed; review required');
  const provenance=JSON.parse(await readFile(path.join(cache,'provenance.json'),'utf8'));
  if(provenance.sha256!==sha(bytes)) throw Error('Provenance mismatch');
  const current=kaiganNetwork(new TextDecoder('shift_jis',{fatal:true}).decode(bytes),'east');
  const old=kaiganNetwork(new TextDecoder('shift_jis',{fatal:true}).decode(await readFile(path.join(ROOT,'.cache/west-expansion/open_kaigan_w_east.csv'))),'east');
  const samples=verifyCurrentEast(current);
  const points=JSON.parse(await readFile(path.join(ROOT,'.cache/west-expansion/kobe-station-centres.json'),'utf8')).elements;
  const stations=NAMES.map((name,i)=>{
    const code='K'+String(i+1).padStart(2,'0'),matches=points.filter(p=>p.type==='node'&&p.tags?.ref===code&&p.tags.name===name&&p.tags.station==='subway');
    if(matches.length!==1) throw Error('Station centre ambiguous: '+name);
    return {id:`kobe-${code.toLowerCase()}`,name,code,operator:'神戸市営地下鉄',line:'海岸線',region:'兵庫・神戸',lat:matches[0].lat,lon:matches[0].lon,directions:(i===0?['west']:i===9?['east']:['east','west']).map(id=>({id,name:id==='east'?'三宮・花時計前方面':'新長田方面'})),sourceUrl:`https://kotsu.city.kobe.lg.jp/subway/timetable1/${STATION_SLUGS[i]}`,coordinateSource:`https://www.openstreetmap.org/node/${matches[0].id}`,coordinateKind:'station-centre-not-entrance',physicalStationId:i===9?'kobe-s09':`kobe-${code.toLowerCase()}`};
  });
  const audit=[],tables=stations.filter(s=>s.directions.some(d=>d.id==='east')).map(s=>{
    const parsed=kaiganDepartures(current,s.name),id=`${s.id}-east-weekday`;
    audit.push({id,name:s.name,departureCount:parsed.departures.length,...parsed,departures:undefined});
    return {id,stationId:s.id,operator:s.operator,line:s.line,directionId:'east',direction:'三宮・花時計前方面',dayType:'weekday',departures:parsed.departures,sourceUrl:SOURCE_URLS['w-east'],retrievedAt:provenance.copiedAt,sourceAcquisition:{kind:'retained-official-download',downloadedAt:null,fileModifiedAt:provenance.fileModifiedAt,importedAt:provenance.copiedAt},checkedAt:REVIEWED_AT,validFrom:REVISION,validTo:null,revisionDate:REVISION,verification:'partial',notes:['保存済み原本の取込。元のネット取得日時は不明。取得日時欄はローカル取込日時です。','神戸市交通局オープンデータ（CC BY 2.1 JP）を加工。','公式HTML3駅の初発・12時台・最終・行先を照合。全駅全便の独立照合ではありません。','西行と土休日の現行CSVは未取得。旧版・別方面・別日では補完しません。','取得来歴と独立照合の確認が残る参考候補。乗車可否の判定に使いません。']};
  });
  const report={revisionDate:REVISION,generatedAt:new Date().toISOString(),license:{name:'CC BY 2.1 JP',sourceUrl:CATALOG,attribution:'神戸市交通局'},source:{...provenance,reviewedAt:REVIEWED_AT},counts:{stations:10,directions:18,expectedTables:36,currentCandidateTables:tables.length,candidateDepartures:tables.reduce((n,t)=>n+t.departures.length,0),missingTables:27,boardingDecisionTables:0},sourceColumns:current.originalColumnNumbers,excludedBlankColumns:current.excludedBlankColumns,terminalArrivalCount:kaiganDepartures(current,'三宮・花時計前').excludedArrivalColumns.length,samples,audit,differences:diffDepartures(old,current),coverage:coverageRows(['w-east']),limitations:['Current CSV bytes recovered from an existing local download; original network retrieval timestamp is unknown.','Normal fetch returned HTTP 202 with x-amzn-waf-action: challenge and 0 bytes.','Normal Brave public catalogue loaded without CAPTCHA; download tools timed out and supplied no new original.','PDF independent check remains unexecuted in this follow-up; official PDF URL returned 403.','Station coordinates are centres from cached OSM, never entrance coordinates.']};
  const archive=path.join(ROOT,'.cache/kobe-kaigan-followup/generated',new Date().toISOString().replace(/[:.]/g,'-'));
  await mkdir(archive,{recursive:true});
  for(const file of ['src/data/kobe-kaigan-candidate.json','src/data/kobe-kaigan-stations.json','docs/kobe-kaigan-followup-20261026-validation.json']) {
    try {await copyFile(path.join(ROOT,file),path.join(archive,path.basename(file)));} catch(error) {if(error.code!=='ENOENT') throw error;}
  }
  await writeFile(path.join(ROOT,'src/data/kobe-kaigan-candidate.json'),json(tables));
  await writeFile(path.join(ROOT,'src/data/kobe-kaigan-stations.json'),json(stations));
  await writeFile(path.join(ROOT,'docs/kobe-kaigan-followup-20261026-validation.json'),json(report));
  console.log(json(report.counts));
}

export function readPinnedReview(bytes) {
  if(sha(bytes)!==INDEPENDENT_REVIEW_SHA) throw Error('Independent review hash changed; explicit review required');
  return JSON.parse(bytes);
}

export function approveCandidate(tables,review,rawBytes,provenance) {
  if(sha(rawBytes)!==LOCAL_HASH||review.rawCsv.sha256!==LOCAL_HASH||review.rawCsv.bytes!==rawBytes.length||provenance.sha256!==LOCAL_HASH) throw Error('Raw CSV hash/provenance mismatch');
  if(!Number.isFinite(Date.parse(review.checkedAt))||Date.parse(review.checkedAt)<Date.parse(provenance.copiedAt)) throw Error('Invalid independent review date');
  const expectedIds=NAMES.slice(1).map((_,i)=>`kobe-k${String(i+2).padStart(2,'0')}-east-weekday`).sort();
  if(JSON.stringify(tables.map(t=>t.id).sort())!==JSON.stringify(expectedIds)||JSON.stringify(review.samples.map(s=>s.tableId).sort())!==JSON.stringify(expectedIds)) throw Error('Independent review scope incomplete or duplicate');
  if(review.summary.stationDirections!==9||review.summary.sampledDepartures!==54||review.summary.matched!==9||review.summary.failed!==0||review.summary.fullDepartureCrosscheck!==false) throw Error('Unexpected review summary');
  const network=kaiganNetwork(new TextDecoder('shift_jis',{fatal:true}).decode(rawBytes),'east');
  return tables.map(t=>{
    const index=Number(t.stationId.slice(-2))-1,name=NAMES[index],sample=review.samples.find(s=>s.tableId===t.id);
    if(t.id!==`${t.stationId}-east-weekday`||t.dayType!=='weekday'||t.directionId!=='east'||sample.dayType!=='weekday'||sample.direction!=='east'||sample.station!==name||!sample.matched) throw Error('Review station/day/direction mismatch');
    const departures=kaiganDepartures(network,name).departures;
    if(JSON.stringify(departures)!==JSON.stringify(t.departures)) throw Error('Candidate departures differ from original CSV');
    const short=d=>({time:d.time,destination:d.destination});
    const actual={first:short(departures[0]),noon:departures.filter(d=>d.time.startsWith('12:')).map(short),last:short(departures.at(-1))};
    if(JSON.stringify(actual)!==JSON.stringify(sample.expected)||JSON.stringify(actual)!==JSON.stringify(sample.actual)) throw Error('Independent sample mismatch');
    if(t.sourceUrl!==SOURCE_URLS['w-east']||t.validFrom!==REVISION||t.revisionDate!==REVISION||t.validTo!==null||t.retrievedAt!==provenance.copiedAt||t.sourceAcquisition?.kind!=='retained-official-download'||t.sourceAcquisition.downloadedAt!==null||t.sourceAcquisition.importedAt!==provenance.copiedAt||t.sourceAcquisition.fileModifiedAt!==provenance.fileModifiedAt) throw Error('Candidate acquisition/revision metadata mismatch');
    return {...t,checkedAt:review.checkedAt,verification:'verified',notes:[t.notes[0],'神戸市交通局オープンデータ（CC BY 2.1 JP）を加工。','平日東行9駅の初発・12時台全便・最終・行先54件を公式HTMLと独立照合。全900便の独立突合ではありません。','西行と土休日の現行CSVは未取得。旧版・別方面・別日では補完しません。','元原本SHA-256と独立レビューSHA-256を固定し、全列構造・終端到着除外・欠損・重複・日付変更を検査。']};
  });
}

export async function approveLocalCandidate() {
  const reviewBytes=await readFile(path.join(ROOT,'docs/kobe-kaigan-independent-20261026.json'));
  const review=readPinnedReview(reviewBytes),rawBytes=await readFile(path.join(ROOT,'docs/kobe-kaigan-followup-20261026-source/open_kaigan_w_east_r080314.csv'));
  const provenance=JSON.parse(await readFile(path.join(ROOT,'docs/kobe-kaigan-followup-20261026-source/provenance.json'),'utf8'));
  const candidateBytes=await readFile(path.join(ROOT,'src/data/kobe-kaigan-candidate.json'));
  const approved=approveCandidate(JSON.parse(candidateBytes),review,rawBytes,provenance);
  const archive=path.join(ROOT,'.cache/kobe-kaigan-followup/approved',new Date().toISOString().replace(/[:.]/g,'-'));
  await mkdir(archive,{recursive:true});
  for(const file of ['src/data/kobe-kaigan.json','docs/kobe-kaigan-followup-20261026-approval.json','docs/kobe-kaigan-followup-20261026-approved-validation.json']) {
    try {await copyFile(path.join(ROOT,file),path.join(archive,path.basename(file)));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await writeFile(path.join(ROOT,'src/data/kobe-kaigan.json'),json(approved));
  await writeFile(path.join(ROOT,'docs/kobe-kaigan-followup-20261026-approved-validation.json'),json({checkedAt:review.checkedAt,rawSha256:sha(rawBytes),independentReviewSha256:sha(reviewBytes),tables:approved.map(t=>({tableId:t.id,sourceUrl:t.sourceUrl,count:t.departures.length,sourceSampleVerification:'passed',sampleCount:6,sampleSourceUrl:review.samples.find(s=>s.tableId===t.id).sourceUrl,fullDepartureCrosscheck:false,checkedAt:review.checkedAt}))}));
  await writeFile(path.join(ROOT,'docs/kobe-kaigan-followup-20261026-approval.json'),json({checkedAt:review.checkedAt,generatedAt:new Date().toISOString(),revisionDate:REVISION,rawSha256:sha(rawBytes),independentReviewSha256:sha(reviewBytes),candidateSha256:sha(candidateBytes),approvedSha256:sha(json(approved)),approvedTables:9,approvedDepartures:900,sampledDepartures:54,fullDepartureCrosscheck:false,missingTables:27,coverage:coverageRows(['w-east']).map(row=>({...row,verification:row.currentCsvAvailable?'verified':'missing',dailyValidity:row.currentCsvAvailable?'date-and-freshness-dependent':false,boardingDecision:row.currentCsvAvailable?'requires-date-validity-and-walk-estimate':false}))}));
  console.log('Approved 9 weekday eastbound tables / 900 departures; 54 independent samples; 27 tables remain missing.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.includes('--refresh')) await acquireCurrent();
  else if(process.argv.includes('--local-candidate')) await buildLocalCandidate();
  else if(process.argv.includes('--approve')) await approveLocalCandidate();
  else throw Error('Use --refresh, --local-candidate or --approve (pinned independent review).');
}
