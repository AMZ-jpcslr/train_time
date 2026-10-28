import {test,expect} from '@playwright/test';
import {chooseStation,FIXED_TIME,mockRuntime,installGps,openWalkingSettings} from '../fixtures/runtime';
import {readFileSync} from 'node:fs';
import type {Entrance} from '../../src/domain/types';
const entrances=JSON.parse(readFileSync(new URL('../../src/data/entrances.json',import.meta.url),'utf8')) as Entrance[];

test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60_000)});await page.clock.pauseAt(FIXED_TIME);});

test('indoor access displays a walking estimate and unverified connections without claiming boarding feasibility',async({page},info)=>{
 const api=await mockRuntime(page);
 await page.route('**/api/walking',async route=>{
  const input=route.request().postDataJSON();api.walking.push(input);
  const end=entrances.find(e=>e.id===input.entranceId)!;
  await route.fulfill({json:{kind:'route',entranceId:end.id,origin:input.origin,destination:{lat:end.lat,lon:end.lon},roadDistanceMeters:240,distanceMeters:320,durationSeconds:256,snapDistances:[70,10],geometry:[[input.origin.lon,input.origin.lat+.0005],[end.lon,end.lat-.00005]],steps:[],fetchedAt:FIXED_TIME.getTime(),provider:'Test pedestrian network',cached:false,dataVersion:null}});
 });
 await page.goto('/classic.html');await chooseStation(page,'jr-ibaraki');await installGps(page,'jr-ibaraki',17);
 await expect(page.locator('.google-walking')).toHaveCount(0);
 await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
 await expect(page.locator('.walk-summary')).toContainText('約 4分');
 await expect(page.locator('.walk-summary')).toContainText('道路経路 約240m');
 await expect(page.locator('.route-access')).toContainText('出発側 約70m ／ 入口側 約10m');
 await expect(page.locator('.chosen-leave')).toHaveCount(0);await expect(page.locator('.decision-location-note')).toContainText('接続区間が未確認');
 await expect(page.locator('.route-diagram figcaption')).toContainText('破線');
 const link=page.getByRole('link',{name:'Googleマップで徒歩経路を見る ↗'});
 const url=new URL((await link.getAttribute('href'))!);
 expect(url.searchParams.get('travelmode')).toBe('walking');expect(url.searchParams.get('origin')).toBe(`${api.walking[0].origin.lat},${api.walking[0].origin.lon}`);
 await expect(page.locator('.google-walking')).toContainText('自動反映されません');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.journey-panel').screenshot({path:`docs/screenshots/${info.project.name}-indoor-walking.png`});
 expect(api.walking).toHaveLength(1);expect(api.external).toEqual([]);
});

test('a provider failure keeps the free Google walking handoff and allows a deliberate route retry',async({page})=>{
 const api=await mockRuntime(page);let attempts=0;
 await page.route('**/api/walking',async route=>{attempts++;if(attempts===1)await route.fulfill({status:503,json:{error:'200m以内に歩道・道路が見つかりませんでした。'}});else await route.fallback();});
 await page.goto('/classic.html');await chooseStation(page,'jr-ibaraki');await installGps(page,'jr-ibaraki',17);
 await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
 await expect(page.locator('.route-error')).toContainText('200m以内');await expect(page.locator('.google-walking')).toBeVisible();
 await expect(page.locator('.chosen-leave')).toHaveCount(0);
 await page.getByRole('button',{name:'徒歩経路を再取得',exact:true}).click();
 await expect(page.locator('.route-error')).toHaveCount(0);await expect(page.locator('.walk-summary')).toContainText('道路経路');
 await expect(page.locator('.chosen-leave')).toHaveCount(1);
 expect(attempts).toBe(2);expect(api.external).toEqual([]);
});
