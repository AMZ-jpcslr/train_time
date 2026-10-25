import type {Station} from './types';
export function validWesternStation(value:unknown):value is Station{
 if(!value||typeof value!=='object')return false;const s=value as Station;
 return /^western-[A-Za-z0-9_-]{10,900}$/.test(s.id)&&typeof s.westernProvider==='string'
  &&(/^(?:jrwest-[a-z0-9-]+|scrape-hankyu|hanshin-rail-part-0[12])$/.test(s.westernProvider))
  &&s.operator===(s.westernProvider.startsWith('jrwest-')?'JR西日本':s.westernProvider==='scrape-hankyu'?'阪急電鉄':'阪神電気鉄道')
  &&typeof s.name==='string'&&s.name.length>0&&s.name.length<101&&typeof s.line==='string'&&s.line.length>0&&s.line.length<1000
  &&typeof s.code==='string'&&s.code.length<20&&Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&s.lat>=20&&s.lat<=50&&s.lon>=120&&s.lon<=150
  &&Array.isArray(s.directions)&&s.directions.length===1&&s.directions[0].id==='all'&&s.directions[0].name==='全方面（各便の行先を確認）'
  &&s.timetablePath==='/api/western/timetable?station='+s.id
  &&typeof s.sourceUrl==='string'&&/^https:\/\/(?:timetable\.jr-odekake\.net|www\.hankyu\.co\.jp|www\.hanshin\.co\.jp)\//.test(s.sourceUrl);
}
