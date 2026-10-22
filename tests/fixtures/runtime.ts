import {expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {Timetable,Entrance} from '../../src/domain/types';
const jr=JSON.parse(readFileSync(new URL('../../src/data/jr.json',import.meta.url),'utf8')) as Timetable[];
const entrances=JSON.parse(readFileSync(new URL('../../src/data/entrances.json',import.meta.url),'utf8')) as Entrance[];

// Deterministic test responses. Facts come from exact-date source fixtures;
// this is not a live routing/API test and does not invent unacquired departures.
export const FIXED_TIME=new Date('2026-10-22T14:00:00+09:00');
const RETRIEVED=new Date(FIXED_TIME.getTime()-60000).toISOString();
export function dailyFixture(date:string){
 const tables=jr.filter(t=>t.serviceDates?.includes(date)).map(t=>({...t,retrievedAt:RETRIEVED,checkedAt:RETRIEVED}));
 return tables.length===8?{schemaVersion:2,serviceDate:date,status:'ready',tables,expiresAt:new Date(Date.parse(RETRIEVED)+6*3600000).toISOString(),errors:[]}
 :{serviceDate:date,status:'unavailable',tables:[],errors:['テスト：この運行日の公式時刻表は未取得です。']};
}
export async function mockRuntime(page:Page){
 const state={walking:[] as {stationId:string;entranceId:string;origin:{lat:number;lon:number}}[],jrDates:[] as string[],external:[] as string[],offline:false};
 await page.route('**/*',async route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){state.external.push(route.request().url());await route.abort();return;}await route.continue();});
 await page.route('**/api/**',async route=>{
  if(state.offline){await route.abort('internetdisconnected');return;}
  const url=new URL(route.request().url());
  if(url.pathname==='/api/config'){await route.fulfill({json:{enabled:true,contactEmail:null,provider:'FOSSGIS / OSRM (test fixture)',privacyUrl:'https://routing.openstreetmap.de/about.html'}});return;}
  if(url.pathname==='/api/jr'){const day=url.searchParams.get('date')??'';state.jrDates.push(day);await route.fulfill({json:dailyFixture(day)});return;}
  if(url.pathname==='/api/walking'){
   const body=route.request().postDataJSON();state.walking.push(body);const entrance=entrances.find(e=>e.id===body.entranceId&&e.stationId===body.stationId);
   if(!entrance){await route.fulfill({status:400,json:{error:'テスト：入口不一致'}});return;}
   await route.fulfill({json:{kind:'route',entranceId:entrance.id,origin:body.origin,distanceMeters:80,roadDistanceMeters:80,durationSeconds:60,snapDistances:[0,0],geometry:[[body.origin.lon,body.origin.lat],[entrance.lon,entrance.lat]],steps:[{distance:80,name:'テスト歩道',type:'depart'}],fetchedAt:FIXED_TIME.getTime(),provider:'FOSSGIS / OSRM (test fixture)',cached:false,dataVersion:null}});return;
  }
  await route.fulfill({status:404,json:{error:'Unexpected API endpoint in test'}});
 });return state;
}
export async function installGps(page:Page,stationId='kyoto-imadegawa',accuracy=10,ageMs=0){
 const entrance=entrances.find(e=>e.stationId===stationId);if(!entrance)throw Error('No checked entrance fixture for '+stationId);
 await page.evaluate(({lat,lon,accuracy,ageMs})=>{navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:lat+.0003,longitude:lon,accuracy,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now()-ageMs} as GeolocationPosition);},{lat:entrance.lat,lon:entrance.lon,accuracy,ageMs});
}
export async function locate(page:Page,stationId='kyoto-imadegawa'){
 await installGps(page,stationId);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
 await expect(page.locator('.location-status')).toContainText('現在地を更新しました');await expect(page.locator('.walk-summary')).toContainText('道路経路');
}
export async function previewAt(page:Page,dateTime:string){
 const input=page.getByLabel('時刻指定プレビュー',{exact:true});if(!await input.isVisible())await page.getByRole('button',{name:/徒歩・乗車余裕の設定/}).click();
 await input.fill(dateTime);await expect(page.locator('.clock')).toContainText('指定時刻 / JST');
}
export async function actualTime(page:Page,dateTime:string){await page.clock.setSystemTime(new Date(dateTime));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));}
export async function saveMeasuredPlace(page:Page,name='試験登録地点'){
 await page.locator('.manual-fallback > summary').click();await page.locator('.place-form > summary').click();
 await page.getByLabel('地点名',{exact:true}).fill(name);await page.getByLabel('到着する駅入口',{exact:true}).fill('試験入口');await page.getByLabel('入口までの実測徒歩時間（分）',{exact:true}).fill('1');await page.getByRole('button',{name:'端末に保存して使う',exact:true}).click();
}
