import { describe, expect, it } from 'vitest';
// @ts-expect-error native Node importer shared with the update command
import { parseHanshinPublicHtml, parseHanshinCrosscheck, compareHanshinSources, verifyHanshinSamples, discoverHanshinPdfs, HANSHIN_PDFS } from '../scripts/import-hanshin.mjs';
import tables from '../src/data/hanshin.json';

// Deliberately tiny synthetic HTML exercises the real public markup; not train data for the app.
function fixture(day = 'weekday') {
 const dw = ['weekday','saturday','holiday'].indexOf(day);
 return '<title>甲子園駅 阪神本線 時刻表</title><button class="ek-save_timetable" data-ek-code="335-13" data-ek-station_name="甲子園" data-ek-line_name="阪神本線"></button>' + [1,2].map(d => {
  const start=d===1?5:4;
  const rows=Array.from({length:25-start},(_,i)=>i+start).map(h=>{
   const hour=h===24?'00':String(h).padStart(2,'0');
   const train=h===start||h===24?`<li class="ek-train-tooltip" data-dest="${d===1?'大阪梅田':'山陽姫路'}" data-tr-type="${d===1?'普通':'直通特急'}" data-start=""><a class="ek-train-link" href="/timetable/railway/train?sf=5257&SFF=335-13&d=${d}&dw=${dw}&dt=&departure=${hour}01"><span class="dest">[${d===1?'普通':'直特'}]${d===1?'梅':'姫'}</span><span class="time-min">01</span></a></li>`:'';
   return `<tr class="ek-hour_line"><td>${hour}</td><td>${train}</td></tr>`;
  }).join('');
  return `<div class="tab-content-inner"><table class="ek-search-result"><tr><th class="select-day">${['平日','土曜','休日'][dw]}</th></tr>${rows}</table><time datetime="2025-2-22"></time></div>`;
 }).join('');
}

describe('Hanshin public timetable parser',()=>{
 it('separates directions, preserves Sanyo destinations, and normalizes service midnight',()=>{
  const p=parseHanshinPublicHtml(fixture(),'weekday');
  expect(p.map((t: {directionId:string})=>t.directionId)).toEqual(['east','west']);
  expect(p[1].departures.at(-1)).toEqual({time:'24:01',destination:'山陽姫路',trainType:'直通特急',platform:null});
  expect(p[0].revisionDate).toBe('2025-02-22');
 });
 it('uses the requested source weekday rather than the machine date',()=>{
  expect(parseHanshinPublicHtml(fixture('holiday'),'holiday')[0].dayType).toBe('holiday');
  expect(()=>parseHanshinPublicHtml(fixture(),'saturday')).toThrow('calendar');
 });
 it('rejects station/line/direction misidentification',()=>{
  expect(()=>parseHanshinPublicHtml(fixture().replace('甲子園駅 阪神本線','甲子園口駅 JR線'),'weekday')).toThrow('station');
  expect(()=>parseHanshinPublicHtml(fixture().replace('SFF=335-13','SFF=335-12'),'weekday')).toThrow('identity');
 });
 it('rejects missing hour rows instead of inferring the omitted trains',()=>{
  expect(()=>parseHanshinPublicHtml(fixture().replace('<tr class="ek-hour_line"><td>06</td><td></td></tr>',''),'weekday')).toThrow('hour');
 });
 it('rejects missing or unknown destination/type facts',()=>{
  expect(()=>parseHanshinPublicHtml(fixture().replace('data-dest="大阪梅田"','data-dest=""'),'weekday')).toThrow('legend');
  expect(()=>parseHanshinPublicHtml(fixture().replace('[普通]梅','[特別]梅'),'weekday')).toThrow('legend');
 });
 it('checks rendered minutes against the public train URL',()=>{
  expect(()=>parseHanshinPublicHtml(fixture().replace('departure=0501','departure=0502'),'weekday')).toThrow('disagree');
  expect(()=>parseHanshinPublicHtml(fixture().replace('class="time-min">01','class="time-min">99'),'weekday')).toThrow('time');
 });
 it('preserves originating-station marks and rejects unknown marks',()=>{
  const marked=fixture().replace('data-start=""','data-start="当駅始発"').replace('class="time-min"','class="time-min start"');
  expect(parseHanshinPublicHtml(marked,'weekday')[0].departures[0].notes).toEqual(['当駅始発']);
  expect(()=>parseHanshinPublicHtml(marked.replace('当駅始発','臨時'),'weekday')).toThrow('annotation');
 });
 it('refuses official link changes and incomplete discovery',()=>{
  const html='<body>甲子園'+Object.values(HANSHIN_PDFS).map(u=>`<a href="${u}">時刻表</a>`).join('')+'</body>';
  expect(discoverHanshinPdfs(html)).toEqual(HANSHIN_PDFS);
  expect(()=>discoverHanshinPdfs(html.replace('koshien_u1.pdf','old.pdf'))).toThrow('changed');
 });
 it('compares full departure sets instead of accepting matching samples alone',()=>{
  const departures=tables[0].departures;
  expect(()=>compareHanshinSources(departures,departures.slice(1))).toThrow('mismatch');
  const changed=departures.map((d,i)=>i===10?{...d,destination:'誤った行先'}:d);
  expect(()=>compareHanshinSources(departures,changed)).toThrow('mismatch');
 });
 it('checks the independent source station before parsing',()=>{
  expect(()=>parseHanshinCrosscheck('<title>別の駅</title>','east','weekday')).toThrow('station');
 });
});

describe('reviewed Hanshin Koshien data',()=>{
 it('contains both directions and both source calendars without mixing Saturday and holiday differences',()=>{
  expect(tables).toHaveLength(4);
  expect(tables.reduce((n,t)=>n+t.departures.length,0)).toBe(1224);
  expect(tables.map(t=>`${t.directionId}/${t.dayType}`).sort()).toEqual(['east/weekday','east/weekend','west/weekday','west/weekend']);
 });
 it('matches first/noon/last/count samples in all four PDFs and preserves provenance',()=>{
  for(const t of tables){
   expect(()=>verifyHanshinSamples(t,`${t.directionId}/${t.dayType}`)).not.toThrow();
   expect(t.revisionDate).toBe('2025-02-22');
   expect(t.validTo).toBeNull();
   expect(t.verification).toBe('verified');
   expect(t.sourceUrl).toContain('ekitan.com');
   expect(t.notes.join(' ')).toContain('臨時');
   expect(t.departures.every(d=>d.platform===null)).toBe(true);
   expect(t.departures.some(d=>d.time.startsWith('24:'))).toBe(true);
  }
 });
 it('rejects a changed first/noon/last or train count',()=>{
  expect(()=>verifyHanshinSamples({...tables[0],departures:tables[0].departures.slice(1)},'east/weekday')).toThrow('differs');
 });
});
