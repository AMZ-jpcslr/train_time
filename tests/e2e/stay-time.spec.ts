import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,locate,saveMeasuredPlace} from '../fixtures/runtime';
test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);});

test('current position shows remaining stay time, departure deadline and passage of time',async({page},info)=>{
 await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');
 await page.getByRole('button',{name:'北大路・国際会館方面'}).click();
 await expect(page.locator('.stay-countdown')).toContainText('計算できません');
 await locate(page);await expect(page.locator('.stay-origin')).toHaveText('今の場所にいられる目安');
 await expect(page.locator('.stay-countdown')).toHaveText('あと 2分 00秒');await expect(page.locator('.stay-deadline')).toContainText('14:02:00');
 await page.clock.fastForward(10000);await expect(page.locator('.stay-countdown')).toHaveText('あと 1分 50秒');
 await page.screenshot({path:`docs/screenshots/${info.project.name}-stay-time-current.png`,fullPage:true});
 await page.clock.fastForward(110000);await expect(page.locator('.stay-countdown')).toHaveText('出発の目安は今です');
 await page.clock.fastForward(1000);await expect(page.locator('.stay-countdown')).toHaveText('出発目安を過ぎています');
 await page.clock.fastForward(180000);await expect(page.locator('.stay-countdown')).toContainText('計算できません');await expect(page.locator('.stay-deadline')).toHaveCount(0);
});

test('registered place identifies the origin and includes configurable station and safety time',async({page},info)=>{
 const api=await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');
 await page.getByRole('button',{name:'北大路・国際会館方面'}).click();await saveMeasuredPlace(page,'休憩場所（テスト）');
 await expect(page.locator('.stay-origin')).toHaveText('登録地点「休憩場所（テスト）」にいられる目安');
 await expect(page.locator('.stay-countdown')).toHaveText('あと 2分 00秒');
 await page.getByRole('button',{name:/徒歩・乗車余裕の設定/}).click();await page.getByLabel('安全余裕（分）',{exact:true}).fill('3');
 await expect(page.locator('.stay-countdown')).toHaveText('あと 1分 00秒');await expect(page.locator('.stay-deadline')).toContainText('14:01:00');
 await page.screenshot({path:`docs/screenshots/${info.project.name}-stay-time-place.png`,fullPage:true});
 expect(api.walking).toHaveLength(0);
});

test('unverified road access cannot claim remaining stay time',async({page})=>{
 await mockRuntime(page);await page.route('**/api/walking',route=>route.fulfill({json:{kind:'route',entranceId:route.request().postDataJSON().entranceId,origin:route.request().postDataJSON().origin,distanceMeters:140,roadDistanceMeters:80,durationSeconds:112,snapDistances:[60,0],geometry:[[135.7593,35.03],[135.7593,35.031]],steps:[],fetchedAt:FIXED_TIME.getTime(),provider:'test',cached:false,dataVersion:null}}));
 await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await locate(page);
 await expect(page.locator('.stay-countdown')).toHaveText('計算できません');await expect(page.locator('.stay-deadline')).toHaveCount(0);
});
