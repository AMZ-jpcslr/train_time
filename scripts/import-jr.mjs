/** JR public daily timetable reader. Factual fields only; local prototype, no redistribution clearance. */
import { load } from 'cheerio';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const ORIGIN='https://timetable.jr-odekake.net';
export const JR_SCOPE_VERSION=2;
const OSAKA_KOBE_DESTINATIONS=new Set(['尼崎','甲子園口','神戸','須磨','西明石','加古川','姫路','網干','播州赤穂','上郡']);
export const OSAKA_TAKARAZUKA_PROOF={
 '宝塚':{sourceUrl:'https://timetable.jr-odekake.net/train-timetable/172201?date=20261023',trainNumber:'1167C',path:['大阪','塚本','尼崎','塚口','猪名寺','伊丹','北伊丹','川西池田','中山寺','宝塚']},
 '新三田':{sourceUrl:'https://timetable.jr-odekake.net/train-timetable/2811?date=20261023',trainNumber:'1169C',path:['大阪','塚本','尼崎','塚口','猪名寺','伊丹','北伊丹','川西池田','中山寺','宝塚','生瀬','西宮名塩','武田尾','道場','三田','新三田']},
};
export const JR_STATIONS=[
 {id:'jr-nishinomiya',name:'西宮',eid:'0610136',routes:[['west','ＪＲ神戸線','三ノ宮・姫路方面'],['east','ＪＲ神戸線','尼崎・大阪・北新地・京都方面']]},
 {id:'jr-osaka',name:'大阪',eid:'0610130',routes:[['east','ＪＲ京都線（快速・普通）','新大阪・高槻・京都方面'],['west','ＪＲ神戸線（快速・普通）','三ノ宮・姫路方面']]},
 {id:'jr-ibaraki',name:'茨木',eid:'0610124',routes:[['east','ＪＲ京都線','高槻・京都方面'],['west','ＪＲ京都線','新大阪・大阪・三ノ宮方面']]},
 {id:'jr-minamikusatsu',name:'南草津',eid:'0610149',routes:[['west','琵琶湖線','京都・大阪方面'],['east','琵琶湖線','草津・米原方面']]},
];
const digest=s=>createHash('sha256').update(s).digest('hex');
const clean=s=>s.replace(/\s+/g,' ').trim();
export function serviceTime(value){if(!/^\d{1,2}:\d{2}$/.test(value))throw Error('Invalid time');let[h,m]=value.split(':').map(Number);if(h>27||m>59)throw Error('Invalid time');if(h<4)h+=24;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
export function validDate(day){if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('Invalid date');return day;}
export function discoverJrLinks(html,station,day){
 const $=load(html);const option=$('#dateSelector option[selected]');if(option.attr('value')!==day)throw Error('Index selected-date mismatch');
 const links=[];
 for(const[directionId,line,direction]of station.routes){let found=[];$('.timetable').each((_,el)=>{if(clean($(el).find('th').text())===line)$(el).find('a').each((_,a)=>{if(clean($(a).text())===direction){const match=$(a).attr('onclick')?.match(/^link\((\d+)\)$/);if(!match)throw Error('Unknown timetable navigation');found.push({directionId,line,direction,providerId:match[1],url:`${ORIGIN}/station-timetable/${match[1]}?date=${day.replaceAll('-','')}`});}});});if(found.length!==1)throw Error('Missing/ambiguous target line or direction');links.push(found[0]);}
 return links;
}
export function parseJrHtml(html,station,route,day){
 const $=load(html);if(clean($('.route-name01').text())!==station.name+'駅'||clean($('.route-name02').text())!==route.line||clean($('.route-name03').text())!==route.direction)throw Error('Station/line/direction mismatch');
 const selected=$('#date option[selected]');if(selected.attr('value')!==day.replaceAll('-',''))throw Error('Selected operating date mismatch');
 const [year,month,date]=day.split('-').map(Number),expectedDate=new RegExp(`^${year}年0?${month}月0?${date}日\\([日月火水木金土祝]\\)$`);
 if(!expectedDate.test(clean(selected.text())))throw Error('Selected date label mismatch');
 const displayedDate=clean($('.select-date .emphasis').text());
 if(!expectedDate.test(displayedDate)||displayedDate!==clean(selected.text()))throw Error('Displayed operating date mismatch');
 const weekday=selected.text().match(/\(([日月火水木金土祝])\)/)?.[1];if(!weekday)throw Error('Unknown operating day class');
 const dayType=weekday==='土'?'saturday':['日','祝'].includes(weekday)?'holiday':'weekday';
 if(!$('.time-tbl-annotation').text().includes('午前4時台')||!$('.time-tbl-annotation').text().includes('午前3時台'))throw Error('Unknown service-day boundary');
 const revision=$('.revision-date').text().match(/改正日:(\d{4})年(\d{1,2})月(\d{1,2})日/);const revisionDate=revision?`${revision[1]}-${revision[2].padStart(2,'0')}-${revision[3].padStart(2,'0')}`:null;
 const pc=new Map();$('.pc-time-tbl-wrap .body-row').each((_,row)=>{const hour=clean($(row).find('td.hour').text());$(row).find('.minute-item').each((_,cell)=>{const c=$(cell),href=c.find('a').attr('href');if(!href||pc.has(href))throw Error('Duplicate/missing PC train link');pc.set(href,{time:serviceTime(`${hour}:${c.find('.minute').text().padStart(2,'0')}`),platform:clean(c.find('.platform_number').text())||null});});});
 const departures=[],departureLinks=[],seen=new Set();$('.sp-time-tbl-wrap .minute-item').each((_,cell)=>{
  const c=$(cell),href=c.find('a').attr('href');if(!href||!new RegExp(`^/train-timetable/\\d+\\?date=${day.replaceAll('-','')}$`).test(href)||seen.has(href))throw Error('Duplicate/unknown train link');seen.add(href);
  const marker=clean(c.find('.mark').text());
  // This legend warns about OTHER operating dates. A selected-date page remains
  // the source for this day; retain its caution rather than inventing a pattern.
  if(marker&&(marker!=='◆'||!clean($('.notes-column').text()).includes('表示の月日以外では、運転していない、または行先・時刻などが変更となる場合があります')))throw Error('Conditional train marker requires additional review');
  const time=serviceTime(clean(c.find('.departure-time').text()));const dest=clean(c.find('.destination').text());if(!/行(?:（.*）)?$/.test(dest))throw Error('Unknown destination syntax');const destination=dest.replace(/行(?=（|$)/,'');
  const types=c.find('.train-name span').map((_,s)=>clean($(s).text())).get().filter(Boolean);if(!types.length)throw Error('Missing train type');
  const platformLabel=clean(c.find('.platform-no').text());if(platformLabel&&!/^のりば\[[^\]]+\]$/.test(platformLabel))throw Error('Unknown platform format');const platform=platformLabel?platformLabel.slice(4,-1):null;
  const counterpart=pc.get(href);if(!counterpart||counterpart.time!==time||counterpart.platform!==platform)throw Error('PC/mobile time or platform mismatch');
  const notes=[...types.slice(1),...(marker?['◆ この運行日以外は運転日・行先・時刻が異なる場合があります。日付指定の掲載便として使用。']:[])];
  departures.push({time,destination,trainType:types[0],platform,...(notes.length?{notes}:{})});
  departureLinks.push(new URL(href,ORIGIN).href);
 });
 if(!departures.length||departures.length!==pc.size)throw Error('Missing departures / PC-mobile count mismatch');
 const keys=new Set();for(let i=0;i<departures.length;i++){const d=departures[i],key=JSON.stringify([d.time,d.destination,d.trainType,d.platform]);if(keys.has(key))throw Error('Duplicate departure fields');keys.add(key);if(i&&departures[i-1].time>d.time)throw Error('Unsorted departures');}
 return{departures,departureLinks,dayType,revisionDate};
}
// Validate the COMPLETE source above first, then narrow only Osaka's westward
// corridor. Through trains at other stations remain in their departure line.
export function applyJrScope(parsed,station,route){
 const scope={version:JR_SCOPE_VERSION,sourceCount:parsed.departures.length,excluded:[],rule:'selected-station-line'};
 if(station.id!=='jr-osaka'||route.directionId!=='west')return{...parsed,scope};
 if(route.line!=='ＪＲ神戸線（快速・普通）')throw Error('Unexpected Osaka west source line');
 scope.rule='osaka-west-kobe-only';const departures=[],departureLinks=[];
 parsed.departures.forEach((departure,index)=>{
  const proof=OSAKA_TAKARAZUKA_PROOF[departure.destination];
  if(proof){scope.excluded.push({...departure,sourceTrainUrl:parsed.departureLinks?.[index]??null,reason:'大阪発・尼崎からJR宝塚線へ分岐するため対象外',routeEvidenceUrl:proof.sourceUrl});return;}
  if(!OSAKA_KOBE_DESTINATIONS.has(departure.destination))throw Error(`Unreviewed Osaka west destination/route: ${departure.destination}`);
  departures.push(departure);departureLinks.push(parsed.departureLinks?.[index]??null);
 });
 if(!departures.length)throw Error('No scoped Osaka JR Kobe departures');
 return{...parsed,departures,departureLinks,scope};
}
// Read independently from the source's first/noon/last mobile cells on 2026-10-22.
export const REVIEWED_SOURCE={
 '2801012001':[216,['05:15','西明石','普通',null],['12:01','西明石','普通',null],['24:20','西明石','普通',null]],
 '2801012002':[217,['05:22','京都','普通',null],['12:03','高槻','普通',null],['24:30','大阪','普通',null]],
 '2796011001':[295,['05:00','京都','普通','8'],['12:00','草津','新快速','8'],['24:10','高槻','普通','7']],
 '2796012001':[295,['05:00','西明石','普通','5'],['12:00','姫路','新快速','5'],['24:04','西明石','普通','6']],
 '2791011001':[219,['05:17','京都','普通',null],['12:04','高槻','普通',null],['24:28','高槻','普通',null]],
 '2791011002':[224,['05:06','加古川','普通',null],['12:01','須磨','普通',null],['24:28','大阪','普通',null]],
 '2813013001':[144,['04:59','姫路','普通（京都から快速）',null],['12:02','網干','普通（高槻から快速）',null],['23:52','京都','普通',null]],
 '2813013002':[149,['05:52','米原','普通',null],['12:12','野洲','普通',null],['24:38','野洲','普通',null]],
};
export const REVIEWED={...REVIEWED_SOURCE,'2796012001':[238,...REVIEWED_SOURCE['2796012001'].slice(1)]};
export function verifySamples(departures,expected){const key=d=>[d.time,d.destination,d.trainType,d.platform];if(!expected||departures.length!==expected[0]||JSON.stringify(key(departures[0]))!==JSON.stringify(expected[1])||JSON.stringify(key(departures.at(-1)))!==JSON.stringify(expected[3])||!departures.some(d=>JSON.stringify(key(d))===JSON.stringify(expected[2])))throw Error('First/noon/last/count differs from reviewed source');}
function validateMetadata(meta,url,sha256,navigation){
 if(meta.sourceUrl!==url||meta.sha256!==sha256)throw Error('JR cache URL/SHA mismatch; use --refresh.');
 if(meta.retrievedAt===null){
  if(!navigation||meta.kind!=='legacy-navigation'||!Number.isFinite(Date.parse(meta.locallyCheckedAt)))throw Error('JR cache retrieval time missing; use --refresh.');
 }else if(typeof meta.retrievedAt!=='string'||!Number.isFinite(Date.parse(meta.retrievedAt)))throw Error('JR cache retrieval timestamp invalid; use --refresh.');
 return meta;
}
export async function readJrCache(target,url,{evidencePath,dataPath,navigation}={}){
 let html;try{html=await readFile(target,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}
 const sha256=digest(html),metaPath=target+'.meta.json';let meta;
 try{meta=JSON.parse(await readFile(metaPath,'utf8'));}catch(e){
  if(e.code!=='ENOENT')throw Error('JR cache metadata corrupt; use --refresh.');
  let evidence,data;try{evidence=JSON.parse(await readFile(evidencePath,'utf8'));data=JSON.parse(await readFile(dataPath,'utf8'));}catch{throw Error('JR cache provenance evidence missing; use --refresh.');}
  if(navigation){
   // Old navigation HTML had no recorded acquisition timestamp. Never invent one.
   const routes=discoverJrLinks(html,navigation.station,navigation.day);
   const expected=evidence.filter(item=>item.indexUrl===url);
   const urls=routes.map(item=>item.url).sort();
   if(expected.length!==urls.length||JSON.stringify(expected.map(item=>item.sourceUrl).sort())!==JSON.stringify(urls)||expected.some(item=>!data.some(t=>t.id===item.id&&t.sourceUrl===item.sourceUrl&&t.retrievedAt===item.retrievedAt)))throw Error('JR navigation has no matching prior URL evidence; use --refresh.');
   meta={sourceUrl:url,sha256,retrievedAt:null,kind:'legacy-navigation',locallyCheckedAt:new Date().toISOString(),note:'Original retrieval timestamp was not recorded. Navigation only; never used for timetable freshness.'};
  }else{
   const matches=evidence.filter(item=>item.sourceUrl===url&&item.sha256===sha256&&data.some(t=>t.id===item.id&&t.sourceUrl===url&&t.retrievedAt===item.retrievedAt));
   const dates=[...new Set(matches.map(item=>item.retrievedAt))];
   if(dates.length!==1)throw Error('JR cache has no unique JSON/URL/SHA provenance match; use --refresh.');
   meta={sourceUrl:url,sha256,retrievedAt:dates[0]};
  }
  validateMetadata(meta,url,sha256,navigation);await writeFile(metaPath,JSON.stringify(meta,null,2)+'\n',{flag:'wx'});
 }
 validateMetadata(meta,url,sha256,navigation);
 return{html,retrievedAt:meta.retrievedAt,sha256,...(meta.locallyCheckedAt?{locallyCheckedAt:meta.locallyCheckedAt}:{})};
}
export function mergeJrEvidence(previous,current){const ids=new Set(current.map(item=>item.id));return[...previous.filter(item=>!ids.has(item.id)),...current];}
export async function obtain(filename,url,folder,refresh,{evidencePath=path.join(ROOT,'docs/jr-validation.json'),dataPath=path.join(ROOT,'src/data/jr.json'),navigation,beforeRequest,signal}={}){
 const target=path.join(folder,filename);
 if(!refresh){const cached=await readJrCache(target,url,{evidencePath,dataPath,navigation});if(!cached)throw Error('JR source cache missing; use --refresh. No automatic network request.');return cached;}
 // Preserve raw bytes and metadata together before an explicit network refresh.
 const archive=target+'.'+Date.now()+'.previous';
 for(const suffix of['','.meta.json']){try{await copyFile(target+suffix,archive+suffix);}catch(e){if(e.code!=='ENOENT')throw e;}}
 signal?.throwIfAborted();await beforeRequest?.();
 const response=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});if(!response.ok)throw Error(`HTTP ${response.status}: ${url}`);const html=await response.text();if(html.length>2000000)throw Error('Unexpected source size');const retrievedAt=new Date().toISOString(),sha256=digest(html);
 await writeFile(target,html);await writeFile(target+'.meta.json',JSON.stringify({sourceUrl:url,sha256,retrievedAt},null,2)+'\n');await new Promise(r=>setTimeout(r,1200));return{html,retrievedAt,sha256};
}
export async function collectJr({day,refresh=false,root=ROOT,sourceOptions={}}={}){
 validDate(day);const folder=path.join(root,'.cache/jr-public',day);await mkdir(folder,{recursive:true});const tables=[],evidence=[];
 for(const station of JR_STATIONS){const indexUrl=`${ORIGIN}/cgi-bin/mydia_sp.cgi?MD=3&FN=0&EID=${station.eid}&date=${day.replaceAll('-','')}`;const index=await obtain(station.eid+'-index.html',indexUrl,folder,refresh,{...sourceOptions,navigation:{station,day}});const routes=discoverJrLinks(index.html,station,day);
  for(const route of routes){const source=await obtain(route.providerId+'.html',route.url,folder,refresh,sourceOptions);const rawParsed=parseJrHtml(source.html,station,route,day);const reviewed=day==='2026-10-22';if(reviewed)verifySamples(rawParsed.departures,REVIEWED_SOURCE[route.providerId]);const parsed=applyJrScope(rawParsed,station,route);if(reviewed)verifySamples(parsed.departures,REVIEWED[route.providerId]);const id=`${station.id}-${route.directionId}-${day}`;
   tables.push({id,scopeVersion:JR_SCOPE_VERSION,stationId:station.id,operator:'JR西日本',line:route.line.normalize('NFKC'),directionId:route.directionId,direction:route.direction,dayType:parsed.dayType,departures:parsed.departures,sourceUrl:route.url,retrievedAt:source.retrievedAt,checkedAt:source.retrievedAt,validFrom:day,validTo:day,revisionDate:parsed.revisionDate,serviceDates:[day],verification:'verified',notes:[`公開日付指定時刻表から発車の事実を抽出。${day}運行日のみ、別日や年間曜日パターンに一般化しない。`,'午前4時〜翌午前3時を1運行日とし0〜3時を24〜27時に正規化。行先/経由・種別の文字情報を保持。','公式サイトは無断転載・複写・加工に関する制限を掲載。ユーザー指定のローカル検証用。再配布・公開の許諾は未確認。',station.id==='jr-osaka'?(route.directionId==='west'?`大阪西はJR神戸線（快速・普通）の対象列車のみ。原表に混在する宝塚・新三田行き${parsed.scope.excluded.length}便は尼崎からJR宝塚線へ分岐するため除外。別欄の在来線特急・環状線等も対象外。`:'大阪東はJR京都線（快速・普通）の掲載便のみ。別欄の在来線特急・環状線・宝塚線等は対象外。'):'対象路線の掲載便を抽出。特急等に別途料金/指定席条件がある場合があります。',`駅・路線・方面・選択日・表示日を確認し、始発から終便まで原表全便の列車リンク・時刻・番線・件数をPC/モバイル表現で自動照合後、対象路線を抽出。${reviewed?'2026-10-22の始発・日中・終電は固定サンプルでも照合。':''}全列車詳細ページの個別突合や運行実績確認は未実施。`,'デザイン・画像・ロゴはアプリへ転用していない。遅延・運休は未反映。']});
   const noon=parsed.departures.find(d=>d.time>='12:00'&&d.time<'13:00');evidence.push({id,sourceUrl:route.url,indexUrl,indexSha256:index.sha256,indexRetrievedAt:index.retrievedAt,...(index.locallyCheckedAt?{indexLocallyCheckedAt:index.locallyCheckedAt}:{}),sha256:source.sha256,retrievedAt:source.retrievedAt,count:parsed.departures.length,scope:parsed.scope,displayedDateMatched:true,pcMobileCountEqual:true,pcMobileAllTimesAndPlatformsMatched:true,duplicates:0,sorted:true,missingDestination:0,samples:[parsed.departures[0],noon,parsed.departures.at(-1)],independentlyReviewed:reviewed,verificationMethod:reviewed?'daily-page-dual-view-route-scope-and-fixed-samples':'daily-page-dual-view-route-scope'});
  }
 }
 return {tables,evidence};
}
export const currentJrServiceDate=(now=Date.now())=>new Date(now+5*60*60*1000).toISOString().slice(0,10);
export async function importJr({day=currentJrServiceDate(),refresh=false}={}){
 const {tables,evidence}=await collectJr({day,refresh});const folder=path.join(ROOT,'.cache/jr-public',day);
 const target=path.join(ROOT,'src/data/jr.json');let existing=[];try{existing=JSON.parse(await readFile(target,'utf8'));await copyFile(target,path.join(folder,`jr.previous.${Date.now()}.json`));}catch{}
 const evidencePath=path.join(ROOT,'docs/jr-validation.json');let priorEvidence=[];try{priorEvidence=JSON.parse(await readFile(evidencePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}const ids=new Set(tables.map(t=>t.id));await writeFile(target,JSON.stringify([...existing.filter(t=>!ids.has(t.id)),...tables],null,2)+'\n');await writeFile(evidencePath,JSON.stringify(mergeJrEvidence(priorEvidence,evidence),null,2)+'\n');console.log(`JR: ${tables.length} date-specific timetables, ${tables.reduce((n,t)=>n+t.departures.length,0)} departures (${day}).`);return tables;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2);importJr({day:args.includes('--date')?args[args.indexOf('--date')+1]:currentJrServiceDate(),refresh:args.includes('--refresh')}).catch(e=>{console.error(e.message);process.exitCode=2;});}
