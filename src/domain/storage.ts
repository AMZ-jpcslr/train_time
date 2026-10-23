import type { SavedPlace, Settings } from './types';
export interface Stored { stationId:string; directionId:string; favorites:string[]; stationFavorites?:string[]; places:SavedPlace[]; settings:Settings }
export const defaults:Stored={stationId:'kobe-gakuentoshi',directionId:'east',favorites:[],stationFavorites:[],places:[],settings:{stationMinutes:3,speedKmh:4.8}};
const finite=(x:unknown,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=max;
export function load():Stored { try {
 const s=JSON.parse(localStorage.getItem('mania-u:v1')||'null');
 if (!s || !Array.isArray(s.places)||!Array.isArray(s.favorites)) return defaults;
 return {stationId:typeof s.stationId==='string'?s.stationId:defaults.stationId,directionId:typeof s.directionId==='string'?s.directionId:defaults.directionId,
 favorites:s.favorites.filter((x:unknown)=>typeof x==='string'),stationFavorites:Array.isArray(s.stationFavorites)?[...new Set(s.stationFavorites.filter((x:unknown):x is string=>typeof x==='string'))] as string[]:[],places:s.places.filter((p:SavedPlace)=>p&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.stationId==='string'&&typeof p.entrance==='string'&&finite(p.walkMinutes,240)),
 settings: {stationMinutes:finite(s.settings?.stationMinutes,60)?s.settings.stationMinutes:3,speedKmh:finite(s.settings?.speedKmh,6)&&s.settings.speedKmh>=1?s.settings.speedKmh:4.8}};
 } catch {return defaults;} }
export function save(state:Stored):boolean {try {
 // Persist only current settings, so retired settings are removed even from an older in-memory state.
 const settings:Settings={stationMinutes:state.settings.stationMinutes,speedKmh:state.settings.speedKmh};
 localStorage.setItem('mania-u:v1',JSON.stringify({...state,settings}));return true;
}catch{return false;}}
