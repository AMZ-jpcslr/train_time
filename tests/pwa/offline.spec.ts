import {test,expect} from '@playwright/test';
import {chooseStation,FIXED_TIME,mockRuntime,installGps,saveMeasuredPlace,previewAt,actualTime,openWalkingSettings,closeWalkingSettings} from '../fixtures/runtime';

test('installed PWA keeps checked tables offline, never invents a route and expires saved JR data',async({page,context})=>{
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60_000)});await page.clock.pauseAt(FIXED_TIME);const api=await mockRuntime(page);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 const manifest=await page.evaluate(async()=>await(await fetch('/manifest.webmanifest')).json());expect(manifest.icons.map((i:{sizes:string})=>i.sizes)).toEqual(expect.arrayContaining(['192x192','512x512']));
 await chooseStation(page,'jr-osaka');await previewAt(page,'2026-10-23T14:00');await expect(page.locator('.timetable-update')).toContainText('日付別公式時刻表を確認済み');
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mania-u:jr-daily:v2')||'{}')))).toContain('2026-10-23');
 // Disable API mocks too: a fulfilled mock must not bypass offline mode.
 api.offline=true;await context.setOffline(true);await page.reload();await previewAt(page,'2026-10-23T14:00');
 await expect(page.locator('.timetable-update')).toContainText('同日の保存データを表示中');await expect(page.getByTestId('data-coverage')).toContainText('2026-10-23');await expect(page.locator('.chosen-decision')).toBeVisible();expect(await page.locator('.vertical-train').count()).toBeGreaterThan(5);
 await page.locator('.alert').getByRole('button',{name:'現在に戻す',exact:true}).click();await installGps(page,'jr-osaka');const settings=await openWalkingSettings(page);await settings.getByRole('button',{name:'位置情報で設定',exact:true}).click();await page.getByRole('button',{name:'位置情報で更新を始める',exact:true}).click();await expect(page.locator('.rail-route-state[role=alert]')).toContainText('徒歩経路を取得できませんでした');await expect(page.locator('.chosen-leave')).toHaveCount(0);await expect(page.locator('.route-diagram')).toHaveCount(0);
 await closeWalkingSettings(page);await chooseStation(page,'kyoto-imadegawa');await expect(page.locator('.chosen-decision')).toBeVisible();await page.getByText('時刻表・出典',{exact:true}).click();await page.getByRole('button',{name:/出典・確認日/}).click();await expect(page.locator('.source-detail')).toContainText('出典照合済');await expect(page.locator('.chosen-leave')).toHaveCount(0);
 await saveMeasuredPlace(page,'オフラインの登録地点');await expect(page.locator('.chosen-leave')).toHaveCount(1);await chooseStation(page,'jr-osaka');await actualTime(page,'2026-10-22T20:00:00+09:00');
 await expect(page.locator('.decision-empty').getByRole('heading',{name:'未取得',exact:true})).toBeVisible();await expect(page.locator('.timetable-update')).toContainText('この日の保存データがないか、取得から6時間を過ぎたため利用できません');
 await chooseStation(page,'kyoto-imadegawa');await expect(page.getByLabel('日時指定プレビュー',{exact:true})).toHaveValue('');await actualTime(page,'2026-12-01T14:00:00+09:00');await expect(page.locator('.decision-empty').getByRole('heading',{name:'ダイヤ適用期間外 / 要再確認'})).toBeVisible();expect(errors).toEqual([]);expect(api.external).toEqual([]);
});
