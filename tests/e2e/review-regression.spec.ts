import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,installGps,locate,actualTime,dailyFixture} from '../fixtures/runtime';

test.beforeEach(async({page})=>{
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);
 await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();
});

test('first viewport identifies the train, leave deadline and scheduled-only limitation; next train works by keyboard',async({page},info)=>{
 await page.setViewportSize(info.project.name==='mobile'?{width:390,height:664}:{width:1280,height:720});
 await locate(page);await page.evaluate(()=>window.scrollTo(0,0));
 const summary=page.getByRole('region',{name:'出発判断',exact:true});
 await expect(summary).toContainText('今出川');await expect(summary).toContainText('北大路・国際会館方面');await expect(summary).toContainText('14:08 発');await expect(summary).toContainText('14:04:00');await expect(summary).toContainText('遅延／運休は未反映');
 for(const selector of ['.decision-station','.decision-train','.stay-countdown','.stay-deadline','.decision-constraint']){
  const box=(await page.locator(selector).boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 }
 const second=await page.locator('.train-choice').nth(1).locator('time').innerText();
 const next=page.getByRole('button',{name:'一本後を選ぶ',exact:true});await next.focus();await next.press('Enter');
 await expect(summary).toContainText(`${second} 発`);await expect(summary.getByRole('heading')).toBeFocused();
 await expect(page.locator('.train-choice').nth(1)).toHaveAttribute('aria-pressed','true');
 expect(await page.locator('.stay-countdown').evaluate(e=>!!e.closest('[aria-live="polite"],[aria-live="assertive"],[role="status"],[role="alert"]'))).toBe(false);
 const announced=await page.locator('.sr-only[role=status]').textContent();await page.clock.fastForward(1000);await expect(page.locator('.sr-only[role=status]')).toHaveText(announced!);
});

test('denied location explains the cause and opens the measured fallback without traversing the train list',async({page},info)=>{
 await page.evaluate(()=>{navigator.geolocation.watchPosition=(_success,error)=>{error?.({code:1,message:'Mock denial',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};});
 await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
 await expect(page.locator('.decision-summary')).toContainText('拒否');await expect(page.locator('.stay-countdown')).toHaveText('計算できません');
 await page.getByRole('button',{name:'実測時間を使う',exact:true}).click();
 await expect(page.getByRole('button',{name:'出発地点',exact:true})).toBeFocused();
 await page.locator('.place-form > summary').click();await page.getByLabel('地点名',{exact:true}).fill('試験地点');await page.getByLabel('到着する駅入口',{exact:true}).fill('試験入口');await page.getByLabel('入口までの実測徒歩時間（分）',{exact:true}).fill('1');
 await page.getByRole('button',{name:'端末に保存して使う',exact:true}).click();
 await expect(page.locator('.stay-origin')).toContainText('試験地点');await expect(page.locator('.stay-countdown')).toContainText('4分');await expect(page.locator('.walk-summary')).toContainText('登録地点「試験地点」から');
 await expect(page.getByRole('heading',{name:'出発判断',exact:true})).toBeFocused();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`docs/screenshots/review-20261023-0109/after-${info.project.name}-measured-recovery.png`});
});

test('expired fallback is not offered as an available station and missing tables have no allowance',async({page})=>{
 await actualTime(page,'2026-12-01T14:00:00+09:00');
 await expect(page.locator('.decision-empty')).toContainText('要再確認');await expect(page.getByRole('button',{name:'取得済みの学園都市を表示'})).toHaveCount(0);await expect(page.locator('.stay-countdown')).toHaveCount(0);
});

test('key decision text meets normal-text contrast and primary controls have 44px touch height',async({page})=>{
 await locate(page);
 const ratios=await page.locator('.decision-summary').evaluate(root=>{
  const rgb=(text:string)=>text.match(/[\d.]+/g)!.slice(0,3).map(Number);
  const luminance=(text:string)=>rgb(text).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const background=luminance(getComputedStyle(root).backgroundColor);
  return ['.decision-station','.decision-countdown','.stay-countdown','.stay-deadline','.decision-constraint'].map(selector=>{
   const foreground=luminance(getComputedStyle(root.querySelector(selector)!).color);
   return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);
  });
 });
 for(const ratio of ratios)expect(ratio).toBeGreaterThanOrEqual(4.5);
 for(const label of ['一本後を選ぶ','実測時間を使う'])expect((await page.getByRole('button',{name:label,exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('three, one and zero remaining candidates, departed selection and foreground refresh use the fixed JST clock',async({page})=>{
 await page.route('**/api/jr?*',async route=>{
  const data=dailyFixture('2026-10-22');data.tables=data.tables.map(t=>({...t,departures:['14:05','14:15','14:25'].map(time=>({time,destination:'模擬終点',trainType:'普通',platform:null}))}));
  await route.fulfill({json:data});
 });
 await chooseStation(page,'jr-osaka');await expect(page.locator('.train-choice')).toHaveCount(3);
 await page.getByRole('button',{name:'一本後を選ぶ',exact:true}).click();await expect(page.locator('.decision-train')).toContainText('14:15');
 await actualTime(page,'2026-10-22T14:16:00+09:00');await expect(page.locator('.train-choice')).toHaveCount(1);await expect(page.locator('.selection-notice')).toContainText('予定発車時刻を過ぎた');await expect(page.locator('.decision-train')).toContainText('14:25');await expect(page.getByRole('button',{name:'一本後を選ぶ'})).toBeDisabled();
 await actualTime(page,'2026-10-22T14:25:00+09:00');await expect(page.locator('.train-choice')).toHaveCount(0);await expect(page.locator('.decision-empty')).toContainText('発車は終了');await expect(page.locator('.stay-countdown')).toHaveCount(0);
});

test('320px and doubled text keep essential content within containers and direction has a non-color selected state',async({page},info)=>{
 await locate(page);await page.setViewportSize({width:320,height:800});await page.evaluate(()=>document.documentElement.style.fontSize='28px');
 await expect(page.getByRole('button',{name:'北大路・国際会館方面'})).toHaveAttribute('aria-pressed','true');
 for(const selector of ['html','.decision-summary','.stay-countdown','.stay-deadline'])expect(await page.locator(selector).evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.locator('.decision-summary').screenshot({path:`docs/screenshots/review-20261023-0109/after-${info.project.name}-large-text.png`});
});

for(const fault of ['wrong-origin','future-time'] as const)test(`rejects ${fault} route responses before displaying a stay allowance`,async({page})=>{
 await page.route('**/api/walking',async route=>{
  const body=route.request().postDataJSON();
  await route.fulfill({json:{kind:'route',entranceId:body.entranceId,origin:fault==='wrong-origin'?{lat:34,lon:135}:body.origin,distanceMeters:80,roadDistanceMeters:80,durationSeconds:60,snapDistances:[0,0],geometry:[[135,35],[135,35.001]],steps:[],fetchedAt:FIXED_TIME.getTime()+(fault==='future-time'?3600000:0),provider:'test',cached:false,dataVersion:null}});
 });
 await installGps(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
 await expect(page.locator('.stay-countdown')).toHaveText('計算できません');
 await expect(page.locator('.route-error')).toContainText('応答を検証できません');
});
