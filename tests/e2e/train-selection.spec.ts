import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,saveMeasuredPlace,locate,previewAt} from '../fixtures/runtime';
test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();});
test('more than five trains show stay time and selection survives the earlier departure',async({page},info)=>{
 await saveMeasuredPlace(page,'休憩場所');const rows=page.locator('.train-choice');expect(await rows.count()).toBeGreaterThan(5);await expect(rows.first().locator('.choice-stay')).toContainText('4分');
 const secondTime=await rows.nth(1).locator('time').innerText();await rows.nth(1).click();await expect(rows.nth(1)).toHaveAttribute('aria-pressed','true');await expect(page.locator('.next-train .destination-row')).toContainText(secondTime);await expect(page.locator('.next-train .pill')).toContainText('次発');
 await page.clock.fastForward(8*60000+1000);await expect(page.locator('.next-train .destination-row')).toContainText(secondTime);await expect(page.locator('.next-train .pill')).toContainText('先発');
 const [h,m]=secondTime.split(':').map(Number);const elapsed=(h*60+m-14*60)*60000+1000-(8*60000+1000);await page.clock.fastForward(elapsed);await expect(page.locator('.selection-notice')).toContainText('予定発車時刻を過ぎた');await expect(page.locator('.next-train .destination-row')).not.toContainText(secondTime);
 await page.screenshot({path:`docs/screenshots/${info.project.name}-train-selection.png`,fullPage:true});
});
test('direction and preview changes reset choice; unverified walking has no stay promise',async({page})=>{
 await expect(page.locator('.choice-stay').first()).toContainText('計算できません');await page.locator('.train-choice').nth(3).click();await expect(page.locator('.next-train .pill')).toContainText('4本目');await page.getByRole('button',{name:'京都・竹田・近鉄奈良方面'}).click();await expect(page.locator('.next-train .pill')).toContainText('先発');
 await page.locator('.train-choice').nth(2).click();await previewAt(page,'2026-10-22T15:00');await expect(page.locator('.next-train .pill')).toContainText('先発');
});
test('choosing another train reuses the pedestrian route',async({page})=>{
 let count=0;page.on('request',r=>{if(r.url().endsWith('/api/walking'))count++;});await locate(page);await page.locator('.train-choice').nth(4).click();await expect(page.locator('.next-train .pill')).toContainText('5本目');expect(count).toBe(1);await expect(page.getByLabel('安全余裕（分）',{exact:true})).toHaveCount(0);
});
