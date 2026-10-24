import holidays from '../data/holidays.json';
import type { DayType, Timetable } from './types';
export const MINUTE = 60000;
export function tokyoDate(time: number): string { return new Date(time + 9*60*MINUTE).toISOString().slice(0,10); }
export function addDays(date: string, days: number): string { return new Date(Date.parse(date+'T00:00:00+09:00')+days*86400000+9*60*MINUTE).toISOString().slice(0,10); }
export function serviceDate(now: number): string { return tokyoDate(now-4*60*MINUTE); }
export function timeMinutes(time: string): number {
  if (!/^(?:[01]\d|2[0-7]):[0-5]\d(?::[0-5]\d)?$/.test(time)) throw new Error(`Invalid service time: ${time}`);
  const [h,m,s=0] = time.split(':').map(Number); return h*60+m+s/60;
}
export function departureEpoch(day: string, time: string): number { return Date.parse(day+'T00:00:00+09:00')+timeMinutes(time)*MINUTE; }
export function dayType(date: string): 'weekday' | 'saturday' | 'holiday' | null {
  const year = Number(date.slice(0,4));
  if (year<holidays.minYear || year>holidays.maxYear) return null;
  if (date in holidays.days) return 'holiday';
  const week = new Date(date+'T12:00:00+09:00').getUTCDay();
  return week===0?'holiday':week===6?'saturday':'weekday';
}
export function matchesDay(type: DayType, day: string): boolean { const actual=dayType(day); return type===actual || (type==='weekend' && (actual==='saturday'||actual==='holiday')); }
export type Availability = 'ready' | 'missing' | 'expired' | 'unverified' | 'special' | 'calendar-unknown';
export function availability(table: Timetable | undefined, day: string, now: number): Availability {
  if (!table) return 'missing';
  if (table.serviceDates && !table.serviceDates.includes(day)) return 'missing';
  if (table.excludedDates?.includes(day)) return 'special';
  // No unverified New Year special service is inferred from a weekday pattern.
  const md=day.slice(5);
  if (!table.serviceDates && (md>='12-29'||md<='01-03')) return 'special';
  if (dayType(day)===null && !table.serviceDates) return 'calendar-unknown';
  if ((table.validFrom && day<table.validFrom)||(table.validTo && day>table.validTo)) return 'expired';
  // Product re-check policy, NOT an operator supplied validity end date.
  const freshness=table.stationId.startsWith('challenge-')?6*3600000:30*86400000;
  if (!Number.isFinite(Date.parse(table.checkedAt)) || now-Date.parse(table.checkedAt)>freshness) return 'expired';
  if (table.verification!=='verified') return 'unverified';
  return 'ready';
}
export function selectTable(tables: Timetable[],stationId: string,directionId: string,day: string): Timetable | undefined {
  const candidates=tables.filter(t=>t.stationId===stationId&&t.directionId===directionId);
  const dated=candidates.filter(t=>t.serviceDates?.includes(day));
  const patterned=candidates.filter(t=>!t.serviceDates && matchesDay(t.dayType,day));
  const ordered=(dated.length?dated:patterned).sort((a,b)=>(b.validFrom??'').localeCompare(a.validFrom??''));
  return ordered.find(t=>(!t.validFrom||day>=t.validFrom)&&(!t.validTo||day<=t.validTo)) ?? ordered[0] ?? (dayType(day)===null?candidates.find(t=>!t.serviceDates):undefined);
}
export function upcoming(table: Timetable,day: string,now: number,limit=5) {
  return table.departures.map(d=>({...d,epoch:departureEpoch(day,d.time)})).filter(d=>d.epoch>now).sort((a,b)=>a.epoch-b.epoch).slice(0,limit);
}
export const formatClock=(now:number)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
