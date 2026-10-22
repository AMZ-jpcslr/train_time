import type { Position, Settings } from './types';
export type Walking = { kind: 'measured'|'route'; minutes: number } | {kind:'estimate'; minutes:number} | {kind:'unavailable'|'failed'};
export function judge(departure: number,now: number,walk: Walking,settings: Settings) {
  const invalid= !Number.isFinite(departure)||!Number.isFinite(now)||!Number.isFinite(settings.stationMinutes)||!Number.isFinite(settings.bufferMinutes)||settings.stationMinutes<0||settings.bufferMinutes<0;
  if (invalid || (walk.kind!=='measured'&&walk.kind!=='route') || !Number.isFinite(walk.minutes)||walk.minutes<0) return {status:'unknown' as const,label:'判定不可',slack:null};
  const slack=(departure-now)/60000-walk.minutes-settings.stationMinutes-settings.bufferMinutes;
  return {status:slack>=3?'comfortable' as const:slack>=0?'tight' as const:'miss' as const,label:slack>=3?'徒歩で余裕あり':slack>=0?'余裕が少ない':'次の便がおすすめ',slack};
}
/** A latest-departure estimate using the same validated inputs as the boarding judgment. */
export function leavingWindow(departure:number,now:number,walk:Walking,settings:Settings){
 if(judge(departure,now,walk,settings).slack===null||!('minutes' in walk))return null;
 const leaveAt=departure-(walk.minutes+settings.stationMinutes+settings.bufferMinutes)*60000;
 const remainingMs=leaveAt-now;
 return {leaveAt,remainingMs,seconds:Math.max(0,Math.floor(remainingMs/1000))};
}
export const MAX_POSITION_ACCURACY_METERS = 100;
export function validPosition(position: Position,now:number) {
  return [position.lat,position.lon,position.accuracy,position.timestamp].every(Number.isFinite)&&Math.abs(position.lat)<=90&&Math.abs(position.lon)<=180&&position.accuracy>=0&&position.timestamp<=now+30000;
}
export function positionStatus(position: Position|null,now:number) {
  if (!position) return 'missing';
  if (!validPosition(position,now)) return 'inaccurate';
  if (now-position.timestamp>5*60000) return 'stale';
  if (position.accuracy>MAX_POSITION_ACCURACY_METERS) return 'inaccurate';
  return 'fresh';
}
export function distanceKm(a:{lat:number;lon:number},b:{lat:number;lon:number}) {
 const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r;
 return 6371*2*Math.atan2(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2),Math.sqrt(1-(Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2)));
}
export function geolocationError(code:number) { return code===1?'位置情報が拒否されました。登録地点の実測時間で利用できます。':code===3?'位置情報の取得がタイムアウトしました。':'位置情報を取得できませんでした。'; }
export function routeMinutes(route:{distanceMeters:number;durationSeconds:number},speedKmh:number){
 if(!Number.isFinite(speedKmh)||speedKmh<1||speedKmh>6||!Number.isFinite(route.distanceMeters)||route.distanceMeters<0||!Number.isFinite(route.durationSeconds)||route.durationSeconds<0) return null;
 // FOSSGIS foot profile uses 4.5 km/h plus penalties. Never reduce below distance/speed.
 return Math.ceil(Math.max(route.durationSeconds*4.5/speedKmh,route.distanceMeters/(speedKmh/3.6))/60);
}
