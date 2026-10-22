export type DayType = 'weekday' | 'saturday' | 'holiday' | 'weekend';
export interface Departure { time: string; destination: string; trainType: string | null; platform: string | null; notes?: string[] }
export interface Timetable {
  id: string; stationId: string; operator: string; line: string; directionId: string; direction: string;
  dayType: DayType; departures: Departure[]; sourceUrl: string; retrievedAt: string; checkedAt: string;
  validFrom: string | null; validTo: string | null; revisionDate: string | null;
  serviceDates?: string[]; excludedDates?: string[];
  verification: 'verified' | 'partial' | 'unverified'; notes: string[];
}
export interface Station { id: string; name: string; operator: string; line: string; code: string; lat: number; lon: number; directions: { id: string; name: string }[]; sourceUrl: string }
export interface SavedPlace { id: string; name: string; stationId: string; entrance: string; walkMinutes: number }
export interface Position { lat: number; lon: number; accuracy: number; timestamp: number }
export interface Entrance {id:string;stationId:string;name:string;lat:number;lon:number;sourceUrl:string;checkedAt:string;note?:string}
export interface WalkingRoute {kind:'route';entranceId:string;origin:{lat:number;lon:number};destination?:{lat:number;lon:number};snapLocations?:number[][];distanceMeters:number;roadDistanceMeters:number;durationSeconds:number;snapDistances:number[];geometry:number[][];steps:{distance:number;name:string;type:string;modifier?:string}[];fetchedAt:number;provider:string;cached:boolean;dataVersion:string|null}
export interface Settings { stationMinutes: number; bufferMinutes: number; speedKmh: number }
