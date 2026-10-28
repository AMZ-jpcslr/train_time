import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,locate,openWalkingSettings} from '../fixtures/runtime';

// Opt-in evidence capture; keep each review's screenshots in its own directory.
test('review evidence: initial, selected, next train and denied location',async({page},info)=>{
 test.skip(!process.env.REVIEW_PHASE,'Run explicitly with REVIEW_PHASE=before or after');
 await page.setViewportSize(info.project.name==='mobile'?{width:390,height:664}:{width:1280,height:900});
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);
 const api=await mockRuntime(page);await page.goto('/classic.html');
 const capture=async(name:string)=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`docs/screenshots/review-20261023-0109/${process.env.REVIEW_PHASE}-${info.project.name}-${name}.png`});};
 await capture('initial');
 await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();await locate(page);
 await expect(page.locator('.chosen-remaining')).toContainText('4分');await capture('selected');
 await page.locator('.vertical-train').nth(1).click();await capture('next');
 await page.evaluate(()=>{navigator.geolocation.watchPosition=(_success,error)=>{error?.({code:1,message:'Mock denial',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};});
 await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await expect(page.locator('.location-status')).toContainText('拒否');await capture('denied');
 expect(api.external).toEqual([]);
});
