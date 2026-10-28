import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,locate,saveMeasuredPlace,openWalkingAdvanced,closeWalkingSettings} from '../fixtures/runtime';
test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);});

test('current position shows exact remaining time and expires stale GPS without promising boarding',async({page})=>{
 await mockRuntime(page);await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();
 await expect(page.getByRole('heading',{name:'徒歩時間を入れて、出る目安を確認'})).toBeVisible();await expect(page.locator('.chosen-leave')).toHaveCount(0);
 await locate(page);await expect(page.locator('.chosen-service')).toContainText('14:08');await expect(page.locator('.chosen-remaining')).toHaveText('4分00秒');
 await expect(page.locator('.chosen-leave time')).toHaveText('14:04');await expect(page.locator('.chosen-leave time')).toHaveAttribute('datetime','2026-10-22T05:04:00.000Z');
 await page.clock.fastForward(10000);await expect(page.locator('.chosen-remaining')).toHaveText('3分50秒');
 await page.clock.fastForward(229000);await expect(page.locator('.chosen-remaining')).toHaveText('0分01秒');
 await page.clock.fastForward(1000);await expect(page.locator('.chosen-remaining')).toHaveText('0分00秒');
 await page.clock.fastForward(1000);await expect(page.locator('.chosen-remaining')).toHaveText('出発目安を過ぎています');await expect(page.locator('.chosen-decision')).toContainText('後の便を選んでください');
 await page.clock.fastForward(60000);await expect(page.locator('.chosen-leave')).toHaveCount(0);await expect(page.locator('.decision-location-note')).toContainText('現在地が古く');
});

test('registered place identifies origin and subtracts station time exactly once',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();await saveMeasuredPlace(page,'休憩場所（テスト）');
 await expect(page.locator('.chosen-decision')).toContainText('登録地点「休憩場所（テスト）」にいられる目安');await expect(page.locator('.chosen-remaining')).toHaveText('4分00秒');
 await openWalkingAdvanced(page);await page.getByLabel('入口からホームまで（分）',{exact:true}).fill('4');await expect(page.locator('.time-breakdown .total')).toContainText('5分');await expect(page.getByLabel('安全余裕（分）',{exact:true})).toHaveCount(0);await closeWalkingSettings(page);
 await expect(page.locator('.chosen-remaining')).toHaveText('3分00秒');await expect(page.locator('.chosen-leave time')).toHaveText('14:03');await expect(page.locator('.chosen-leave time')).toHaveAttribute('datetime','2026-10-22T05:03:00.000Z');expect(api.walking).toHaveLength(0);
});

test('unverified road access cannot claim remaining stay time',async({page})=>{
 await mockRuntime(page);await page.route('**/api/walking',route=>route.fulfill({json:{kind:'route',entranceId:route.request().postDataJSON().entranceId,origin:route.request().postDataJSON().origin,distanceMeters:140,roadDistanceMeters:80,durationSeconds:112,snapDistances:[60,0],geometry:[[135.7593,35.03],[135.7593,35.031]],steps:[],fetchedAt:FIXED_TIME.getTime(),provider:'test',cached:false,dataVersion:null}}));
 await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await locate(page);await expect(page.locator('.chosen-leave')).toHaveCount(0);await expect(page.locator('.chosen-remaining')).toHaveCount(0);await expect(page.locator('.decision-location-note')).toContainText('接続区間が未確認');
});
