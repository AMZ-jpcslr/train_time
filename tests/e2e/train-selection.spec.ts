import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,saveMeasuredPlace,locate,previewAt,openWalkingAdvanced,closeWalkingSettings} from '../fixtures/runtime';
test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);await mockRuntime(page);await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();});

test('vertical candidates preserve manual choice until that train departs',async({page})=>{
 await saveMeasuredPlace(page,'休憩場所');const rows=page.locator('.vertical-train');expect(await rows.count()).toBeGreaterThan(5);await expect(page.locator('.chosen-remaining')).toHaveText('4分00秒');
 const secondTime=await rows.nth(1).locator('time').innerText();expect(secondTime).toBe('14:15');await rows.nth(1).click();await expect(rows.nth(1)).toHaveAttribute('aria-pressed','true');await expect(page.locator('.chosen-service')).toContainText(secondTime);await expect(page.locator('.selection-mode')).toHaveText('選んだ電車');
 await expect(page.locator('.chosen-leave time')).toHaveText('14:11');await expect(page.locator('.chosen-remaining')).toHaveText('11分00秒');
 await page.clock.fastForward(8*60000+1000);await expect(page.locator('.chosen-service')).toContainText(secondTime);await expect(page.locator('.selection-mode')).toHaveText('選んだ電車');
 await page.clock.fastForward(7*60000);await expect(page.locator('.selection-notice')).toContainText('予定発車時刻を過ぎた');await expect(page.locator('.chosen-service')).not.toContainText(secondTime);await expect(page.locator('.selection-mode')).toHaveText('条件に合う次の電車');
});

test('direction and preview reset manual selection and unset walking never gives a deadline',async({page})=>{
 await expect(page.locator('.chosen-leave')).toHaveCount(0);await page.locator('.vertical-train').nth(3).click();await expect(page.locator('.selection-mode')).toHaveText('選んだ電車');await page.getByRole('button',{name:'京都・竹田・近鉄奈良方面'}).click();await expect(page.locator('.selection-mode')).toHaveText('条件に合う次の電車');
 await page.locator('.vertical-train').nth(2).click();await previewAt(page,'2026-10-22T15:00');await expect(page.locator('.selection-mode')).toHaveText('条件に合う次の電車');await expect(page.locator('.chosen-leave')).toHaveCount(0);
});

test('choosing another train reuses the pedestrian route and reset returns to next matching train',async({page})=>{
 let count=0;page.on('request',r=>{if(r.url().endsWith('/api/walking'))count++;});await locate(page);const chosen=await page.locator('.vertical-train').nth(4).locator('time').innerText();await page.locator('.vertical-train').nth(4).click();await expect(page.locator('.chosen-service')).toContainText(chosen);await expect(page.locator('.selection-mode')).toHaveText('選んだ電車');expect(count).toBe(1);
 await page.getByRole('button',{name:'自動選択に戻す',exact:true}).click();await expect(page.locator('.chosen-service')).toContainText('14:08');await expect(page.locator('.selection-mode')).toHaveText('条件に合う次の電車');await expect(page.getByRole('button',{name:'自動選択に戻す',exact:true})).toBeDisabled();expect(count).toBe(1);
});

test('slower walking changes the deadline but never silently chooses another train',async({page})=>{
 await locate(page);await expect(page.locator('.chosen-service')).toContainText('14:08');await openWalkingAdvanced(page);await page.getByLabel('歩行速度（km/h）',{exact:true}).fill('1');await closeWalkingSettings(page);
 await expect(page.locator('.chosen-service')).toContainText('14:08');await expect(page.locator('.chosen-leave time')).toHaveText('14:00');await expect(page.locator('.chosen-remaining')).toHaveText('0分00秒');
 await page.clock.fastForward(1000);await expect(page.locator('.chosen-service')).toContainText('14:08');await expect(page.locator('.chosen-remaining')).toHaveText('出発目安を過ぎています');
 await page.getByRole('button',{name:'条件に合う一本後',exact:true}).click();await expect(page.locator('.chosen-service')).toContainText('14:15');await expect(page.locator('.chosen-leave time')).toHaveText('14:07');await expect(page.locator('.chosen-remaining')).toHaveText('6分59秒');
});
