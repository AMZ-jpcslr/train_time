import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {CHALLENGE_END} from './odpt-challenge-providers.mjs';
const holidays=JSON.parse(readFileSync(new URL('../src/data/holidays.json',import.meta.url),'utf8'));
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
const refs=value=>Array.isArray(value)?value:typeof value==='string'?[value]:[];
const symbol=row=>row?.['owl:sameAs'];
const title=(row,field)=>row?.[field]?.ja||row?.['dc:title']||null;
const DAY_CALENDARS={Weekday:'weekday',Saturday:'saturday',Sunday:'holiday',Holiday:'holiday',SaturdayHoliday:'weekend'};
export function normalizeChallenge(provider,data,checkedAt){
 const maps=Object.fromEntries(Object.entries(data).map(([type,rows])=>[type,new Map(rows.map(row=>[symbol(row),row]))]));
 const stations=new Map(),tables={},audit={sourceTables:data.StationTimetable.length,sourceDepartures:0,importedDepartures:0,unsupportedCalendars:0,unknownDestinations:0};
 for(const raw of data.StationTimetable){
  if(raw['odpt:operator']!==provider.operator)throw Error('ODPT事業者の検証に失敗しました。');
  // Some providers publish shared physical stations under one railway, while
  // explicitly listing the other railway's timetable on that station record.
  const linkedStations=data.Station.filter(s=>refs(s['odpt:stationTimetable']).includes(symbol(raw)));
  const sourceStation=maps.Station.get(raw['odpt:station'])||(linkedStations.length===1?linkedStations[0]:null),railway=maps.Railway.get(raw['odpt:railway']);
  if(!sourceStation||!railway)throw Error('ODPT駅・路線の参照を確認できませんでした。');
  const name=title(sourceStation,'odpt:stationTitle'),line=title(railway,'odpt:railwayTitle');
  const lat=Number(sourceStation['geo:lat']),lon=Number(sourceStation['geo:long']);
  if(!name||!line||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<20||lat>50||lon<120||lon>150)throw Error('ODPT駅情報の形式を確認できませんでした。');
  const calendar=String(raw['odpt:calendar']||'').replace(/^odpt.Calendar:/,'');
  const special=maps.Calendar?.get(raw['odpt:calendar']),duration=special?.['odpt:duration'];
  const calendarDates=Array.isArray(special?.['odpt:day'])?special['odpt:day'].filter(day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day):[];
  const specialVerified=calendarDates.length>0&&calendarDates.length===special['odpt:day'].length&&typeof duration==='string'&&/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(duration)&&calendarDates.every(day=>day>=duration.slice(0,10)&&day<=duration.slice(11));
  const dayType=DAY_CALENDARS[calendar]||(specialVerified?'weekday':null);
  if(calendar.startsWith('Specific.')&&!specialVerified)throw Error('ODPT特別運行日を確認できませんでした。');
  if(!dayType){audit.unsupportedCalendars++;continue;}
  const railDirection=raw['odpt:railDirection'];
  const directionName=title(maps.RailDirection.get(railDirection),'odpt:railDirectionTitle');
  if(!directionName)throw Error('ODPT方面名を確認できませんでした。');
  const sid=`challenge-${provider.id}-${digest(raw['odpt:station']+'/'+raw['odpt:railway'])}`,did='d-'+digest(railDirection);
  const departures=[];
  for(const d of raw['odpt:stationTimetableObject']??[]){
   audit.sourceDepartures++;
   const value=d['odpt:departureTime'];
   if(typeof value!=='string'||!/^(?:[01]\d|2[0-7]):[0-5]\d(?::[0-5]\d)?$/.test(value))throw Error('ODPT発車時刻の形式を確認できませんでした。');
   // ODPT uses 00:xx for the late part of the preceding operating day.
   const hour=Number(value.slice(0,2)),time=(hour<4?String(hour+24):value.slice(0,2))+value.slice(2);
   const dest=refs(d['odpt:destinationStation']).map(ref=>title(maps.Station.get(ref),'odpt:stationTitle'));
   if(!dest.length||dest.some(v=>!v))audit.unknownDestinations++;
   const destination=dest.length&&dest.every(Boolean)?dest.join('・'):'行先未確認';
   const type=maps.TrainType.get(d['odpt:trainType']);
   const trainType=title(type,'odpt:trainTypeTitle');
   const platform=d['odpt:platformNumber']==null?null:String(d['odpt:platformNumber']);
   const trainNumber=d['odpt:trainNumber']==null?undefined:String(d['odpt:trainNumber']);
   departures.push({time,destination,trainType,platform,...(trainNumber?{trainNumber}:{})});audit.importedDepartures++;
  }
  if(!departures.length)continue;
  departures.sort((a,b)=>a.time.localeCompare(b.time)||a.destination.localeCompare(b.destination));
  // Identical visible departures cannot be selected independently in the current UI.
  if(new Set(departures.map(d=>JSON.stringify(d))).size!==departures.length)throw Error('ODPTの同一発車を区別できないため表示を保留しました。');
  if(!stations.has(sid))stations.set(sid,{id:sid,name,operator:provider.name,line,code:String(sourceStation['odpt:stationCode']||provider.code),lat,lon,
   directions:[],aliases:[sourceStation['odpt:stationTitle']?.en,sourceStation['odpt:stationTitle']?.ja_hrkt].filter(Boolean),region:'首都圏',
   sourceUrl:provider.sourceUrl,challengeProvider:provider.id,timetablePath:`/api/odpt/timetable?station=${sid}`});
  const station=stations.get(sid);if(!station.directions.some(d=>d.id===did))station.directions.push({id:did,name:directionName+'方面'});
  (tables[sid]??=[]).push({id:sid+'-'+did+'-'+digest(symbol(raw)||JSON.stringify(raw)),stationId:sid,operator:provider.name,line,directionId:did,
   direction:directionName+'方面',dayType,...(specialVerified?{calendarDates,calendarDuration:duration}:{}),departures,sourceUrl:provider.sourceUrl,retrievedAt:checkedAt,checkedAt,validFrom:null,validTo:CHALLENGE_END,
   revisionDate:null,verification:'verified',notes:[`${provider.name}・公共交通オープンデータ協議会のチャレンジ2026限定データを加工。`,
    'ODPT駅時刻表の運行区分を内閣府の祝日表と照合。年末年始の特別ダイヤは推測しません。',
    '列車の遅延・運休・臨時変更と、駅入口は未確認です。徒歩判定には実測時間を登録してください。',
    '行先・種別が参照できない場合は未確認と表示します。']});
 }
 for(const s of stations.values())s.directions.sort((a,b)=>a.name.localeCompare(b.name,'ja'));
 const list=[...stations.values()];
 if(!list.length)throw Error('ODPTの利用可能な駅時刻表がありません。');
 return {version:3,calendarSupport:1,provider:provider.id,checkedAt,stations:list,tables,
  coverage:{id:provider.id,operator:provider.name,stationCount:list.length,checkedAt,sourceUrl:provider.sourceUrl,
   lines:[...new Set(list.map(s=>s.line))].sort().map(name=>({name,stationCount:list.filter(s=>s.line===name).length})),audit}};
}
export function challengeDayTables(snapshot,stationId,day,now){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('ODPT運行日が不正です。');
 const today=new Date(now+9*3600000).toISOString().slice(0,10),md=day.slice(5);
 if(day<'2026-07-01'||day>CHALLENGE_END||Math.abs(Date.parse(day)-Date.parse(today))>31*86400000)throw Error('ODPT運行日は提供期間内・現在日から31日以内を指定してください。');
 if(md>='12-29'||md<='01-03')throw Error('ODPT年末年始の特別ダイヤは未確認です。公式時刻表を確認してください。');
 const year=Number(day.slice(0,4));if(year<holidays.minYear||year>holidays.maxYear)throw Error('ODPT祝日情報の対象年外です。');
 const dow=new Date(day+'T12:00:00+09:00').getUTCDay(),kind=day in holidays.days||dow===0?'holiday':dow===6?'saturday':'weekday';
 const rows=snapshot.tables[stationId];if(!rows)throw Error('ODPTの駅が見つかりません。');
 for(const table of rows.filter(t=>t.calendarDates))if(day<table.calendarDuration.slice(0,10)||day>table.calendarDuration.slice(11))throw Error('ODPT特別運行日の確認期間外です。');
 const candidates=rows.filter(t=>t.calendarDates?t.calendarDates.includes(day):t.dayType===kind||t.dayType==='weekend'&&kind!=='weekday');
 const selected=[];
 for(const directionId of new Set(candidates.map(t=>t.directionId))){
  const matching=candidates.filter(t=>t.directionId===directionId),dated=matching.filter(t=>t.calendarDates),exact=matching.filter(t=>t.dayType===kind);
  const values=dated.length?dated:exact.length?exact:matching;if(values.length!==1)throw Error('ODPTの運行区分が重複しているため表示を保留しました。');
  const {calendarDates,calendarDuration,...table}=values[0];
  selected.push({...table,dayType:kind,serviceDates:[day],validFrom:day,validTo:day});
 }
 if(!selected.length)throw Error('ODPTの指定運行日の時刻表を確認できませんでした。');
 return selected;
}
