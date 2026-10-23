import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,saveMeasuredPlace,actualTime} from '../fixtures/runtime';
test.beforeEach(async({page})=>{
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();
});
test('long walk reveals reachable trains beyond five, allows past/future browsing and synchronizes the relative rail diagram',async({page},info)=>{
 await page.getByRole('button',{name:'実測時間を使う',exact:true}).click();
 await page.getByLabel('地点名',{exact:true}).fill('試験用の遠い場所');await page.getByLabel('到着する駅入口',{exact:true}).fill('試験入口');await page.getByLabel('入口までの実測徒歩時間（分）',{exact:true}).fill('60');await page.getByRole('button',{name:'端末に保存して使う'}).click();
 expect(await page.locator('.train-choice').count()).toBeGreaterThan(5);
 expect(await page.locator('.departure-card .comfortable,.departure-card .tight').count()).toBeGreaterThanOrEqual(3);
 await expect(page.locator('.departure-card.is-selected')).not.toContainText('出発目安を過ぎています');
 const selectedEpoch=Number(await page.locator('.departure-card.is-selected').getAttribute('data-epoch'));expect(selectedEpoch).toBeGreaterThanOrEqual(FIXED_TIME.getTime()+63*60000);
 await expect(page.locator('.rail-disclaimer')).toContainText('実位置ではありません');
 await page.screenshot({path:`docs/screenshots/timeline-20261023/${info.project.name}-reachable.png`});
 const strip=page.locator('.timeline-strip');await strip.focus();await strip.press('Home');await page.clock.runFor(100);
 await expect(page.locator('.departure-card').first()).toBeInViewport();await expect(page.locator('.past-choice').first()).toBeDisabled();
 const before=await page.locator('.rail-caption').innerText();await strip.press('ArrowRight');await page.clock.runFor(100);expect(await page.locator('.rail-caption').innerText()).not.toBe(before);
 await strip.press('End');await page.clock.runFor(100);await expect(page.locator('.departure-card').last()).toBeInViewport();
 await page.getByRole('button',{name:'現在付近へ',exact:true}).click();await page.clock.runFor(100);await expect(page.locator('.train-choice').first()).toBeInViewport();
 await page.getByRole('button',{name:'出発に余裕のある便へ'}).click();await page.clock.runFor(100);await expect(page.locator('.departure-card.is-selected')).toBeInViewport();
 expect(await page.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.getByRole('button',{name:'京都・竹田・近鉄奈良方面'}).click();await expect(page.locator('.rail-stations')).toContainText('丸太町');
});
test('unknown location never produces reachable advice; after last departure history remains and no trains are invented',async({page},info)=>{
 await expect(page.locator('.stay-countdown')).toHaveText('計算できません');await expect(page.getByRole('button',{name:'出発に余裕のある便へ'})).toBeDisabled();
 await page.evaluate(()=>{navigator.geolocation.watchPosition=(_s,e)=>{e?.({code:1,message:'mock',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};});await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await expect(page.locator('.decision-location-note')).toContainText('拒否');
 await saveMeasuredPlace(page);await actualTime(page,'2026-10-23T03:00:00+09:00');await expect(page.locator('.train-choice')).toHaveCount(0);expect(await page.locator('.past-choice').count()).toBeGreaterThan(5);await expect(page.locator('.decision-empty')).toContainText('発車は終了');
 await page.screenshot({path:`docs/screenshots/timeline-20261023/${info.project.name}-end-service.png`});
});
test('small screens, enlarged text and reduced motion retain keyboard access',async({page},info)=>{
 await page.setViewportSize({width:320,height:800});await page.emulateMedia({reducedMotion:'reduce'});await saveMeasuredPlace(page);await page.evaluate(()=>document.documentElement.style.fontSize='28px');
 const strip=page.locator('.timeline-strip');await strip.focus();await strip.press('ArrowRight');await page.clock.runFor(100);await expect(strip).toBeFocused();
 expect(await page.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.screenshot({path:`docs/screenshots/timeline-20261023/${info.project.name}-large-text.png`});
});
