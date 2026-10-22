/** Read the public station timetable as facts; never copy its assets or appearance. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { load } from 'cheerio';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CACHE = path.join(ROOT, '.cache/hanshin');
const hash = raw => createHash('sha256').update(raw).digest('hex');
export const HANSHIN_STATION = 'https://www.hanshin.co.jp/station/koshien.html';
export const HANSHIN_PDFS = {
 'east/weekday':'https://www.hanshin.co.jp/search/koshien_u1.pdf',
 'west/weekday':'https://www.hanshin.co.jp/search/koshien_h1.pdf',
 'east/weekend':'https://www.hanshin.co.jp/search/koshien_u2.pdf',
 'west/weekend':'https://www.hanshin.co.jp/search/koshien_h2.pdf',
};
export const HANSHIN_SOURCES = Object.fromEntries(['weekday','saturday','holiday'].map((d,i)=>[d,`https://ekitan.com/timetable/railway/line-station/335-13/d1?dw=${i}`]));
export const HANSHIN_SAMPLES = {
 'east/weekday': ['05:01/大阪梅田','12:02/大阪梅田','24:29/尼崎',323],
 'west/weekday': ['04:45/新開地','12:09/西宮','24:33/御影',314],
 'east/weekend': ['05:01/大阪梅田','12:02/大阪梅田','24:29/尼崎',303],
 'west/weekend': ['04:45/新開地','12:09/西宮','24:33/御影',284],
};
const typeCodes = {'普通':'普通','直特':'直通特急','特急':'特急','急行':'急行','快急':'快速急行','区急':'区間急行','区特':'区間特急'};
const destCodes = {'梅':'大阪梅田','奈':'近鉄奈良','難':'大阪難波','大':'大和西大寺','尼':'尼崎','高':'高速神戸','姫':'山陽姫路','開':'新開地','三':'神戸三宮','須':'須磨浦公園','西':'西宮','東':'東須磨','御影':'御影','元町':'元町'};
const normalizeTime = (h,m) => {
 if(!/^\d{1,2}$/.test(String(h))||!/^\d{2}$/.test(String(m))||+h>27||+m>59)throw Error('Invalid Hanshin time');
 return `${String(+h<4?+h+24:+h).padStart(2,'0')}:${m}`;
};

export function discoverHanshinPdfs(html) {
 const $=load(html); if(!$('body').text().includes('甲子園'))throw Error('Wrong Hanshin station');
 const links=$('a[href]').map((i,e)=>new URL($(e).attr('href'),HANSHIN_STATION).href).get();
 for(const url of Object.values(HANSHIN_PDFS))if(!links.includes(url))throw Error('Official timetable links changed; review required');
 return {...HANSHIN_PDFS};
}

export function parseHanshinPublicHtml(html, dayType) {
 const dw=['weekday','saturday','holiday'].indexOf(dayType);
 if(dw<0)throw Error('Unknown source day');
 const $=load(html);
 if(!$('title').text().includes('甲子園駅 阪神本線'))throw Error('Wrong Hanshin station or line');
 if($('.ek-save_timetable').toArray().some(n=>$(n).attr('data-ek-code')!=='335-13'||$(n).attr('data-ek-station_name')!=='甲子園'||$(n).attr('data-ek-line_name')!=='阪神本線'))throw Error('Station identity mismatch');
 const panes=$('.tab-content-inner').toArray().filter(n=>$(n).find('table.ek-search-result').length);
 if(panes.length!==2)throw Error('Expected both Hanshin directions');
 return panes.map((pane,index)=>{
  const p=$(pane), directionId=index===0?'east':'west',rows=p.find('.ek-hour_line');
  if(p.find('.select-day').text().trim()!==['平日','土曜','休日'][dw])throw Error('Source calendar mismatch');
  const rev=p.find('time[datetime]').attr('datetime')?.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if(!rev)throw Error('Missing revision');
  const revisionDate=`${rev[1]}-${rev[2].padStart(2,'0')}-${rev[3].padStart(2,'0')}`;
  const departures=[],hours=[];
  rows.each((_,row)=>{
   const hour=$(row).children('td').first().text().trim();
   hours.push(+hour<4?+hour+24:+hour);
   $(row).find('.ek-train-tooltip').each((i,node)=>{
    const n=$(node),a=n.find('a.ek-train-link');
    if(a.length!==1)throw Error('Missing train link');
    const u=new URL(a.attr('href'),'https://ekitan.com'), q=u.searchParams;
    if(q.get('sf')!=='5257'||q.get('SFF')!=='335-13'||q.get('d')!==String(index+1)||q.get('dw')!==String(dw)||q.get('dt'))throw Error('Train identity/calendar mismatch');
    const minute=n.find('.time-min').text().trim(), time=normalizeTime(hour,minute);
    if(q.get('departure')!==`${hour.padStart(2,'0')}${minute}`)throw Error('Displayed and linked time disagree');
    const destination=n.attr('data-dest'),trainType=n.attr('data-tr-type'),label=n.find('.dest').text().trim().match(/^\[([^\]]+)\](.+)$/);
    if(!label||typeCodes[label[1]]!==trainType||destCodes[label[2]]!==destination)throw Error('Unknown or mismatching destination/type legend');
    const start=n.attr('data-start')??'';
    if(!['','当駅始発'].includes(start))throw Error('Unknown source annotation');
    if(n.find('.time-min').hasClass('start')!==Boolean(start))throw Error('Origin annotation disagrees');
    departures.push({time,destination,trainType,platform:null,...(start?{notes:[start]}:{})});
   });
  });
  const expectedHours=Array.from({length:index===0?20:21},(_,i)=>i+(index===0?5:4));
  if(JSON.stringify(hours)!==JSON.stringify(expectedHours))throw Error('Missing or unsorted hour row');
  if(!departures.length||departures.some((d,i)=>i&&d.time<departures[i-1].time))throw Error('Unsorted or empty Hanshin table');
  if(new Set(departures.map(d=>`${d.time}/${d.destination}/${d.trainType}`)).size!==departures.length)throw Error('Duplicate departure');
  return {directionId,dayType,revisionDate,departures};
 });
}

export function parseHanshinCrosscheck(html,directionId,dayType) {
 const $=load(html),direction=directionId==='east'?'大阪梅田・近鉄奈良':'高速神戸・山陽姫路';
 if(!$('title').text().includes(`甲子園駅(阪神本線 ${direction}方面)`))throw Error('Crosscheck station/direction mismatch');
 if($('.navDayOfWeek span').text()!==(dayType==='weekday'?'平日':'土曜'))throw Error('Crosscheck day mismatch');
 const legend=id=>Object.fromEntries($(id+' li').map((i,e)=>$(e).text().split('：')).get().reduce((a,v,i,all)=>i%2?a:[...a,[v,all[i+1]]],[]));
 const types=legend('#timeNotice1'),dests=legend('#timeNotice2'),departures=[];
 $('.tblDiaDetail tr[id^=hh_]').each((i,row)=>{
  const h=$(row).children('.hour').text();
  $(row).find('.timeNumb').each((j,node)=>{
   const n=$(node),dt=n.find('dt').clone();dt.find('.mark').remove();
   const time=normalizeTime(h,dt.text().trim().padStart(2,'0'));
   const trainType=types[n.find('.trainType').text().replace(/[\[\]]/g,'')||'無印'];
   const original=dests[n.find('.trainFor').text()||'無印'];
   const aliases={'大阪梅田(阪神線)':'大阪梅田','尼崎(阪神線)':'尼崎','神戸三宮(阪神)':'神戸三宮','御影(兵庫県・阪神線)':'御影','元町(兵庫県)':'元町'};
   const destination=aliases[original]??original;
   if(!trainType||!destination)throw Error('Unknown crosscheck legend');
   departures.push({time,destination,trainType});
  });
 });
 return departures;
}

export function verifyHanshinSamples(table,key) {
 const s=HANSHIN_SAMPLES[key],keys=table.departures.map(d=>`${d.time}/${d.destination}`);
 if(!s||keys.length!==s[3]||keys[0]!==s[0]||!keys.includes(s[1])||keys.at(-1)!==s[2])throw Error('Hanshin first/noon/last/count differs; review required');
}

export function compareHanshinSources(a,b) {
 const key=d=>`${d.time}/${d.destination}/${d.trainType}`;
 if(a.length!==b.length||a.some((d,i)=>key(d)!==key(b[i])))throw Error('Hanshin independent source mismatch; review required');
}

async function getSource(name,sourceUrl,refresh) {
 const file=path.join(CACHE,name+'.html'),metaFile=path.join(CACHE,name+'.meta.json');
 if(!refresh){
  let raw,meta;try{raw=await readFile(file);meta=JSON.parse(await readFile(metaFile,'utf8'));}catch(e){if(e.code==='ENOENT')throw Error('Hanshin cache missing; use --refresh');throw e;}
  if(meta.sourceUrl!==sourceUrl||meta.sha256!==hash(raw)||!Number.isFinite(Date.parse(meta.retrievedAt)))throw Error('Hanshin cache provenance mismatch');
  return {text:raw.toString('utf8'),...meta};
 }
 const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error(`Hanshin source HTTP ${response.status}; no bypass/retry`);
 const raw=Buffer.from(await response.arrayBuffer());if(raw.length>2_000_000)throw Error('Unexpected source size');
 const meta={sourceUrl,retrievedAt:new Date().toISOString(),sha256:hash(raw)};
 const history=path.join(CACHE,'history',`${meta.retrievedAt.replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
 for(const old of [file,metaFile])try{await mkdir(history,{recursive:true});await copyFile(old,path.join(history,path.basename(old)));}catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(file,raw);await writeFile(metaFile,JSON.stringify(meta,null,2)+'\n');
 await new Promise(r=>setTimeout(r,1200));
 return {text:raw.toString('utf8'),...meta};
}

export async function importHanshin({refresh=false}={}) {
 await mkdir(CACHE,{recursive:true});
 const sources={},parsed={};
 for(const [day,url]of Object.entries(HANSHIN_SOURCES)){
  sources[day]=await getSource(`ekitan-${day}`,url,refresh);
  parsed[day]=parseHanshinPublicHtml(sources[day].text,day);
 }
 for(let i=0;i<2;i++)if(JSON.stringify(parsed.saturday[i].departures)!==JSON.stringify(parsed.holiday[i].departures))throw Error('Saturday and holiday differ; do not merge');
 const tables=[],validation=[];
 for(const day of ['weekday','saturday'])for(const p of parsed[day]){
  if(p.revisionDate!=='2025-02-22')throw Error('New Hanshin revision requires official PDF review');
  const dayType=day==='weekday'?'weekday':'weekend',key=`${p.directionId}/${dayType}`;
  verifyHanshinSamples(p,key);
  const name=p.directionId==='east'&&day==='weekday'?'yahoo':`yahoo-${p.directionId}-${day}`;
  const url=`https://transit.yahoo.co.jp/timetable/26350/${p.directionId==='east'?'4231':'4230'}${name==='yahoo'?'':`?kind=${day==='weekday'?'1':'2'}`}`;
  const cross=await getSource(name,url,refresh), other=parseHanshinCrosscheck(cross.text,p.directionId,day);
  compareHanshinSources(p.departures,other);
  const source=sources[day];
  tables.push({id:`hanshin-koshien-${p.directionId}-${dayType}`,stationId:'hanshin-koshien',operator:'阪神電気鉄道',line:'阪神本線',directionId:p.directionId,direction:p.directionId==='east'?'大阪梅田・大阪難波・近鉄奈良方面':'神戸三宮・山陽姫路方面',dayType,departures:p.departures,sourceUrl:source.sourceUrl,retrievedAt:source.retrievedAt,checkedAt:source.retrievedAt,validFrom:p.revisionDate,validTo:null,revisionDate:p.revisionDate,verification:'verified',notes:[
   `公開時刻表の事実情報を抽出。駅探: ${source.sourceUrl}`,
   `公式駅ページが現在リンクする2025年2月22日改正PDF: ${HANSHIN_PDFS[key]}`,
   '公式PDFの始発・日中・終電の時刻/行先を文字抽出で照合。PDFの囲み数字・色は抽出で欠落するため全便の種別/行先/時刻は駅探HTMLとYahoo公開HTMLで突合。',
   '土曜と休日を個別取得して全便一致を確認。標準ダイヤのみ。野球開催時の臨時列車、臨時停車、ホーム変更、特別日の変更は未収録。ホーム番号は未取得。',
   '駅探・Yahooの利用条件は加工/再利用等を制限。無料閲覧は転載・再配布許可を意味しない。利用許諾の確認は未完了で、一般公開・再配布はしていない。',
   '公式PDF通常HTTPS/IABは403。認証やアクセス制限の回避は行っていない。キャッシュ再解析では確認日を更新しない。',
  ]});
  validation.push({id:tables.at(-1).id,sourceUrl:source.sourceUrl,retrievedAt:source.retrievedAt,checkedAt:source.retrievedAt,sha256:source.sha256,revisionDate:p.revisionDate,count:p.departures.length,duplicates:0,sorted:true,samples:HANSHIN_SAMPLES[key],officialPdf:HANSHIN_PDFS[key],crosscheck:{sourceUrl:cross.sourceUrl,sha256:cross.sha256,retrievedAt:cross.retrievedAt,matched:other.length},holidaySource:dayType==='weekend'?{sourceUrl:sources.holiday.sourceUrl,sha256:sources.holiday.sha256,retrievedAt:sources.holiday.retrievedAt,matched:other.length}:null});
 }
 await writeFile(path.join(ROOT,'src/data/hanshin.json'),JSON.stringify(tables,null,2)+'\n');
 await writeFile(path.join(ROOT,'docs/hanshin-validation.json'),JSON.stringify(validation,null,2)+'\n');
 console.log(`Hanshin: ${tables.length} tables, ${tables.reduce((n,t)=>n+t.departures.length,0)} departures`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))importHanshin({refresh:process.argv.includes('--refresh')}).catch(e=>{console.error(e.message);process.exitCode=1;});
