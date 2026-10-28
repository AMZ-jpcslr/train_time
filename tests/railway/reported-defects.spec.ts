import {test,expect,type Page,type Route} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,installControlledGps,emitGps,gpsWatchState,closeWalkingSettings} from '../fixtures/runtime';
import {locationSettings,setMinutes} from './walking-helpers';
import {mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
const entrances=JSON.parse(readFileSync(new URL('../../src/data/entrances.json',import.meta.url),'utf8')) as {id:string;lat:number;lon:number}[];
async function response(route:Route,snaps:number[]){const body=route.request().postDataJSON(),end=entrances.find(e=>e.id===body.entranceId)!;await route.fulfill({json:{kind:'route',entranceId:end.id,origin:body.origin,distanceMeters:80+snaps[0]+snaps[1],roadDistanceMeters:80,durationSeconds:60+snaps[0]+snaps[1],snapDistances:snaps,geometry:[[body.origin.lon,body.origin.lat],[end.lon,end.lat]],fetchedAt:FIXED_TIME.getTime(),provider:'Synthetic route fixture',cached:false}});}
async function start(page:Page){await locationSettings(page);await page.getByRole('button',{name:'位置情報で更新を始める',exact:true}).click();}
async function setup(page:Page){await page.clock.install({time:FIXED_TIME});await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await installControlledGps(page);}
for(const [side,snaps] of [['現在地側',[45,0]],['駅入口側',[0,55]]] as const)test(`unverified ${side} keeps the limit and offers a usable manual fallback`,async({page})=>{
 await setup(page);await page.route('**/api/walking',route=>response(route,[...snaps]));await start(page);await emitGps(page,10);
 const notice=page.locator('.rail-access-check');await expect(notice).toContainText(side);await expect(notice).toContainText(`${Math.max(...snaps)}m`);await expect(page.locator('.rail-gps-duration')).toHaveCount(0);await closeWalkingSettings(page);await expect(page.locator('.chosen-leave')).toHaveCount(0);await expect(page.locator('.rail-board')).toContainText('道路までの歩行を確認してください');
 await locationSettings(page);await notice.getByRole('button',{name:'徒歩時間を入力して続ける',exact:true}).click();await page.getByRole('spinbutton',{name:'駅入口までの徒歩時間（分）',exact:true}).fill('2');await page.getByRole('button',{name:'2分で設定',exact:true}).click();await expect(page.locator('.chosen-leave')).toBeVisible();expect((await gpsWatchState(page)).cleared).toContain(1);
});
test('disconnected provider response stays unavailable and retry accepts only a valid route',async({page})=>{
 await setup(page);let attempts=0;await page.route('**/api/walking',async route=>{if(++attempts===1)await route.fulfill({status:502,json:{error:'出発側と駅入口側を結ぶ徒歩経路が見つかりませんでした。'}});else await response(route,[0,0]);});await start(page);await emitGps(page,10);
 const error=page.locator('.rail-route-state[role=alert]');await expect(error).toContainText('徒歩経路を取得できませんでした');await expect(error.getByRole('button',{name:'徒歩時間を入力して続ける'})).toBeEnabled();await page.getByText('位置情報・経路の詳細',{exact:true}).click();await expect(page.locator('.rail-location-setup')).toContainText('出発側と駅入口側を結ぶ徒歩経路が見つかりませんでした');await expect(page.locator('.chosen-leave')).toHaveCount(0);
 await error.getByRole('button',{name:'もう一度取得',exact:true}).click();await expect(page.locator('.rail-gps-duration')).toContainText('1分');await closeWalkingSettings(page);await expect(page.locator('.chosen-leave')).toBeVisible();expect(attempts).toBe(2);
});
test('poor accuracy sends no route and a stalled request times out without a departure promise',async({page})=>{
 await setup(page);let requests=0;await page.route('**/api/walking',()=>{requests++;});await start(page);await emitGps(page,150);await expect(page.locator('.location-status')).toContainText('誤差');expect(requests).toBe(0);
 await emitGps(page,10);await expect.poll(()=>requests).toBe(1);await page.clock.fastForward(20001);await expect(page.locator('.rail-route-state[role=alert]')).toContainText('タイムアウト');await expect(page.locator('.chosen-leave')).toHaveCount(0);await expect(page.getByRole('button',{name:'もう一度取得',exact:true})).toBeEnabled();await page.clock.fastForward(46000);await expect(page.locator('.location-status')).toContainText('新しい位置');await expect(page.locator('.chosen-leave')).toHaveCount(0);await expect(page.getByRole('dialog',{name:'徒歩時間・駅構内の設定',exact:true}).getByRole('button',{name:'徒歩時間を入力',exact:true})).toBeEnabled();
});
test('announcements and closed overlays never create a dark document below the dock',async({page},info)=>{
 await page.setViewportSize({width:390,height:720});await setup(page);await setMinutes(page);await page.locator('.vertical-train').nth(2).click();
 for(const name of ['徒歩入力','種別','駅・対応範囲']){await page.getByRole('navigation',{name:'よく使う操作'}).getByRole('button',{name,exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('dialog[open]')).toHaveCount(0);}
 for(const size of [{width:320,height:568},{width:390,height:844},{width:1440,height:900}]){await page.setViewportSize(size);await page.locator('.railway-shell>main').evaluate(element=>{element.scrollTop=element.scrollHeight;});expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);expect(await page.locator('.action-bottom-nav').evaluate(element=>Math.abs(element.getBoundingClientRect().bottom-innerHeight)<=1)).toBe(true);expect(await page.evaluate(()=>!!document.elementFromPoint(innerWidth/2,innerHeight-5)?.closest('.action-bottom-nav'))).toBe(true);}
 if(info.project.name==='desktop'){await mkdir('docs/railway-live/screenshots',{recursive:true});await page.screenshot({path:'docs/railway-live/screenshots/bottom-gap-fixed.png'});}
});
