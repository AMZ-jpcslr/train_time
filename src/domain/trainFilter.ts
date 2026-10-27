import type {Departure,Station,Timetable} from './types';
import {availability,dayType,selectTable} from './time';

export const trainTypeName=(train:Departure)=>train.trainType?.trim()||'種別不明';
export const filterContext=(station:string,direction:string,day:string)=>JSON.stringify([station,direction,dayType(day)]);
export function activeTypes(saved:string[]|null,available:string[]){return saved===null?null:saved.filter(type=>available.includes(type));}
export function filterTrains<T extends Departure>(trains:T[],types:string[]|null):T[]{return types===null?trains:trains.filter(train=>types.includes(trainTypeName(train)));}
export function stationCapability(station:Station,tables:Timetable[],day:string,now:number){
 if(station.catalogOnly)return {label:'参考情報',detail:'駅名のみ。時刻表・出発目安は未対応。',ready:false};
 const selected=station.directions.map(d=>selectTable(tables,station.id,d.id,day));
 const ready=selected.filter(t=>availability(t,day,now)==='ready'&&(!station.id.startsWith('jr-')||(t?.serviceDates?.includes(day)&&now-Date.parse(t.checkedAt)<=6*3600000))).length;
 if(ready)return {label:'出発目安対応',detail:`${ready}/${station.directions.length}方面で確認済み。徒歩時間の設定が必要。`,ready:true};
 if(selected.some(t=>t?.verification==='partial'))return {label:'参考情報',detail:'現行ダイヤ未確認。出発目安には使いません。',ready:false};
 if(selected.some(Boolean))return {label:'時刻表のみ',detail:'期限・確認状態により出発目安を停止中。',ready:false};
 return {label:'時刻表を確認する',detail:station.timetablePath?'選択後にこの日のデータを取得します。対応は取得後に確認。':'この日・方面の確認済み時刻表はありません。',ready:false};
}
export function stationRegion(s:Station){
 if(s.region&&/大阪|京都|兵庫|神戸|滋賀|奈良|和歌山|関西|近畿/.test(s.region))return '関西';
 if(s.region)return s.region;
 if(['神戸市営地下鉄','京都市営地下鉄','阪急電鉄','阪神電気鉄道'].includes(s.operator)||s.operator==='JR西日本'&&!s.westernProvider)return '関西';
 return s.operator==='JR西日本'?'西日本（地域未分類）':'地域未分類';
}
export function readTypePreferences(raw:string|null):Record<string,string[]>{
 try{const data:unknown=JSON.parse(raw||'{}');if(!data||typeof data!=='object'||Array.isArray(data))return {};
 return Object.fromEntries(Object.entries(data).filter(([key,value])=>key.length<500&&Array.isArray(value)&&value.length<=100&&value.every(x=>typeof x==='string'&&x.length<=100)).slice(-100));}catch{return {};}
}
