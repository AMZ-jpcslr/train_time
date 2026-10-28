import {test,expect} from '@playwright/test';
import {chooseStation,FIXED_TIME,mockRuntime,installControlledGps,emitGps,gpsWatchState,openWalkingSettings} from '../fixtures/runtime';

test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60_000)});await page.clock.pauseAt(FIXED_TIME);});

test('a coarse first fix improves to 17m before a single walking request is made',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await installControlledGps(page);
 await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await expect(page.getByRole('button',{name:'取得中…',exact:true})).toBeDisabled();await emitGps(page,202);
 await expect(page.locator('.location-accuracy')).toContainText('推定誤差 半径約202m');expect(api.walking).toHaveLength(0);await expect(page.locator('.chosen-leave')).toHaveCount(0);
 await page.clock.fastForward(3000);await emitGps(page,17);await expect(page.locator('.location-status')).toContainText('現在地を更新しました');await expect(page.locator('.walk-summary')).toContainText('道路経路');
 expect(api.walking).toHaveLength(1);await expect(page.locator('.location-accuracy')).toContainText('推定誤差 半径約17m');await expect(page.getByRole('button',{name:'取得を中止',exact:true})).toHaveCount(0);
 expect(await gpsWatchState(page)).toEqual({count:1,cleared:[1],options:[{enableHighAccuracy:true,maximumAge:0,timeout:20000}]});await emitGps(page,5);await page.clock.fastForward(20000);expect(api.walking).toHaveLength(1);expect(api.external).toEqual([]);
});

test('a persistent 202m fix remains reference-only with help and no routing request',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/classic.html');await installControlledGps(page);await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await emitGps(page,202);
 await page.clock.fastForward(19999);await expect(page.getByRole('button',{name:'取得を中止',exact:true})).toBeVisible();expect(api.walking).toHaveLength(0);await page.clock.fastForward(1);
 await expect(page.locator('.location-help')).toBeVisible();await expect(page.locator('.location-status')).toContainText('現在地の誤差が大きいため、出発目安を計算できません');await expect(page.locator('.location-accuracy')).toContainText('推定誤差 半径約202m');await expect(page.locator('.chosen-leave')).toHaveCount(0);await expect(page.getByRole('button',{name:'現在地を更新',exact:true})).toBeEnabled();
 expect(api.walking).toHaveLength(0);expect((await gpsWatchState(page)).cleared).toEqual([1]);expect(api.external).toEqual([]);
});

test('cancelled and superseded location callbacks cannot restore a stale location',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/classic.html');await installControlledGps(page);await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await emitGps(page,202);await page.getByRole('button',{name:'取得を中止',exact:true}).click();
 await expect(page.locator('.location-status')).toContainText('中止');await emitGps(page,17);await expect(page.locator('.location-accuracy')).toHaveCount(0);expect(api.walking).toHaveLength(0);
 await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await emitGps(page,5,0);await expect(page.getByRole('button',{name:'取得中…',exact:true})).toBeDisabled();expect(api.walking).toHaveLength(0);
 await emitGps(page,17,1);await expect(page.locator('.walk-summary')).toContainText('道路経路');expect(api.walking).toHaveLength(1);expect((await gpsWatchState(page)).cleared).toEqual([1,2]);
});

test('hiding the page cancels the pending watch and does not start a request on return',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/classic.html');await installControlledGps(page);await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await emitGps(page,202);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.location-status')).toContainText('画面を離れたため');
 await emitGps(page,17);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(20000);
 await expect(page.getByRole('button',{name:'現在地を更新',exact:true})).toBeEnabled();await expect(page.locator('.location-accuracy')).toHaveCount(0);expect((await gpsWatchState(page)).cleared).toEqual([1]);expect(api.walking).toHaveLength(0);expect(api.external).toEqual([]);
});
