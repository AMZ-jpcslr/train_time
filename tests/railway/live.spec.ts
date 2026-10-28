import {locationSettings,manualSettings} from './walking-helpers';
import {test,expect,type Page} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,installControlledGps,emitGps,gpsWatchState,openWalkingSettings,closeWalkingSettings,previewAt} from '../fixtures/runtime';
import {readFileSync} from 'node:fs';
const entrances=JSON.parse(readFileSync(new URL('../../src/data/entrances.json',import.meta.url),'utf8')) as {stationId:string;lat:number;lon:number}[];
test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);});
async function begin(page:Page){await locationSettings(page);await page.getByRole('button',{name:'位置情報で更新を始める',exact:true}).click();}
test('real app flow: explicit live updates, route throttle, countdown, inaccurate/stale fixes and stop',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await installControlledGps(page);
 expect((await gpsWatchState(page)).count).toBe(0);await begin(page);await emitGps(page,17);
 await expect(page.locator('.rail-gps-duration')).toContainText('1分');expect(api.walking).toHaveLength(1);
 await closeWalkingSettings(page);await expect(page.locator('.rail-ticket .chosen-leave')).toBeVisible();
 const count=await page.locator('.rail-ticket-count').innerText();await page.clock.fastForward(1000);await expect(page.locator('.rail-ticket-count')).not.toHaveText(count);
 await emitGps(page,17);expect(api.walking).toHaveLength(1);
 await emitGps(page,202);await expect(page.locator('.rail-ticket .chosen-leave')).toHaveCount(0);expect(api.walking).toHaveLength(1);
 await emitGps(page,10);await expect.poll(()=>api.walking.length).toBe(2);
 await page.clock.fastForward(46000);await expect(page.locator('.rail-ticket .chosen-leave')).toHaveCount(0);
 await locationSettings(page);await expect(page.locator('.location-status')).toContainText('新しい位置');await page.getByRole('button',{name:'更新を停止',exact:true}).click();
 await emitGps(page,10);expect(api.walking).toHaveLength(2);expect((await gpsWatchState(page)).cleared).toEqual([1]);expect(api.external).toEqual([]);
});
test('permission errors, start timeout, restart and station/date navigation release watches',async({page})=>{
 await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await installControlledGps(page);await begin(page);
 await page.clock.fastForward(20000);await expect(page.locator('.location-status')).toContainText('タイムアウト');expect((await gpsWatchState(page)).cleared).toEqual([1]);
 await page.getByRole('button',{name:'位置情報で更新を始める',exact:true}).click();
 await page.evaluate(()=>{const state=(window as any).__controlledGps;state.watches[1].error({code:1});});
 await expect(page.locator('.location-status')).toContainText('許可されていません');
 await page.getByRole('button',{name:'位置情報で更新を始める',exact:true}).click();await emitGps(page,10,2);
 await chooseStation(page,'kobe-gakuentoshi');expect((await gpsWatchState(page)).cleared).toContain(3);
 await begin(page);await emitGps(page,10,3,'kobe-gakuentoshi');
 await previewAt(page,'2026-10-22T15:00');expect((await gpsWatchState(page)).cleared).toContain(4);
 await locationSettings(page);await expect(page.getByRole('button',{name:'位置情報で更新を始める',exact:true})).toBeDisabled();
});
test('foreground-only collection and manual fallback do not keep tracking',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await installControlledGps(page);await begin(page);await emitGps(page,10);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('.location-status')).toContainText('画面を離れた');expect((await gpsWatchState(page)).cleared).toEqual([1]);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 expect((await gpsWatchState(page)).count).toBe(1);
 await page.getByRole('button',{name:'位置情報で更新を始める',exact:true}).click();await emitGps(page,10,1);
 await manualSettings(page);await page.getByLabel('駅入口までの徒歩時間（分）',{exact:true}).fill('2');await page.getByRole('button',{name:'2分で設定',exact:true}).click();
 expect((await gpsWatchState(page)).cleared).toEqual([1,2]);await expect(page.locator('.rail-ticket .chosen-leave')).toBeVisible();
 const requests=api.walking.length;await emitGps(page,10,1);expect(api.walking).toHaveLength(requests);
 expect(await page.evaluate(()=>localStorage.getItem('mania-u:v1'))).not.toContain('latitude');expect(api.external).toEqual([]);
});
test('entrance vicinity needs sustained accuracy; ticket clip is once per session and reduced motion is honored',async({page})=>{
 await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await installControlledGps(page);await begin(page);
 const target=entrances.find(e=>e.stationId==='kyoto-imadegawa')!;
 const near=()=>page.evaluate(({lat,lon})=>{(window as any).__controlledGps.watches[0].success({coords:{latitude:lat,longitude:lon,accuracy:8},timestamp:Date.now()});},target);
 await near();await page.clock.fastForward(4000);await near();await expect(page.locator('.rail-ticket')).toHaveAttribute('data-near-entrance','false');
 await page.clock.fastForward(4000);await near();await expect(page.locator('.rail-ticket')).toHaveAttribute('data-near-entrance','true');await expect(page.locator('.rail-ticket')).toHaveClass(/rail-ticket-clip/);
 await page.clock.fastForward(500);await expect(page.locator('.rail-ticket')).not.toHaveClass(/rail-ticket-clip/);await near();await expect(page.locator('.rail-ticket')).not.toHaveClass(/rail-ticket-clip/);
 await expect(page.locator('.rail-arrival-note')).toContainText('乗車は確認できません');await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.rail-ticket').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
});
