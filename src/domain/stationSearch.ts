import type {Station} from './types';
export const normalizeStationQuery=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('ja')
 .replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60));
export function searchStations(stations:Station[],query:string):Station[]{
 const terms=normalizeStationQuery(query).trim().split(/\s+/).filter(Boolean);
 if(!terms.length)return [];
 return stations.filter(station=>{
  const text=normalizeStationQuery([station.name,station.operator,station.line,station.code,station.region,...(station.aliases??[]),...(station.westernProvider?[station.code+station.name,station.operator+station.name]:[])].join(' '));
  return terms.every(term=>text.includes(term));
 }).sort((a,b)=>Number(normalizeStationQuery(b.name)===terms.join(''))-Number(normalizeStationQuery(a.name)===terms.join('')));
}
