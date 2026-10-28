import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,saveMeasuredPlace,actualTime,openWalkingSettings,closeWalkingSettings} from '../fixtures/runtime';
// The adopted application uses a vertical candidate list. Legacy snapping/rail-diagram
// mechanics are no longer a normal-app contract; retain their user outcomes here.
test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);await mockRuntime(page);await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();});

test('long walk keeps the next train and permits an explicit later reachable choice beyond five',async({page})=>{
 await saveMeasuredPlace(page,'試験用の遠い場所','60');const rows=page.locator('.vertical-train');expect(await rows.count()).toBeGreaterThan(5);await expect(page.locator('.chosen-service')).toContainText('14:08');await expect(page.locator('.chosen-remaining')).toHaveText('出発目安を過ぎています');
 const later=rows.filter({has:page.locator('time',{hasText:'15:08'})});await later.click();await expect(later).toHaveAttribute('aria-pressed','true');await expect(page.locator('.chosen-service')).toContainText('15:08');await expect(page.locator('.chosen-leave time')).toHaveText('14:05');await expect(page.locator('.chosen-leave time')).toHaveAttribute('datetime','2026-10-22T05:05:00.000Z');await expect(page.locator('.chosen-decision')).toBeFocused();
 await rows.last().focus();await expect(rows.last()).toBeFocused();await rows.first().focus();await rows.first().press('Enter');await expect(rows.first()).toHaveAttribute('aria-pressed','true');await expect(page.locator('.chosen-remaining')).toHaveText('出発目安を過ぎています');await page.getByRole('button',{name:'京都・竹田・近鉄奈良方面'}).click();await expect(page.locator('.selection-mode')).toHaveText('条件に合う次の電車');
});

test('denied location cannot create a deadline and after final service no future trains are invented',async({page})=>{
 await expect(page.locator('.chosen-leave')).toHaveCount(0);await page.evaluate(()=>{navigator.geolocation.watchPosition=(_s,e)=>{e?.({code:1,message:'mock',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};});await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await closeWalkingSettings(page);await expect(page.locator('.decision-location-note')).toContainText('拒否');await saveMeasuredPlace(page);await actualTime(page,'2026-10-23T03:00:00+09:00');await expect(page.locator('.vertical-train')).toHaveCount(0);await expect(page.locator('.decision-empty')).toContainText('便は終了');await expect(page.locator('.chosen-leave')).toHaveCount(0);
});

test('small screens, enlarged text and reduced motion retain keyboard selection',async({page})=>{
 await page.setViewportSize({width:320,height:800});await page.emulateMedia({reducedMotion:'reduce'});await saveMeasuredPlace(page);await page.evaluate(()=>document.documentElement.style.fontSize='28px');const row=page.locator('.vertical-train').nth(2),time=await row.locator('time').innerText();await row.focus();await row.press('Enter');await expect(page.locator('.chosen-service')).toContainText(time);await expect(page.locator('.chosen-decision')).toBeFocused();expect(await page.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(await row.evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
});
