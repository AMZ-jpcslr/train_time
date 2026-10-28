import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,installGps,locate,actualTime,dailyFixture,openWalkingSettings,closeWalkingSettings,saveMeasuredPlace} from '../fixtures/runtime';
test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);await mockRuntime(page);await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();});

test('train, deadline and limitation are explicit and next train works by keyboard without live countdown announcements',async({page})=>{
 await locate(page);const summary=page.getByRole('region',{name:'出発判断',exact:true});await expect(summary).toContainText('今出川');await expect(summary).toContainText('北大路・国際会館方面');await expect(page.locator('.chosen-service')).toContainText('14:08');await expect(page.locator('.chosen-leave time')).toHaveText('14:04');await expect(page.locator('.chosen-leave time')).toHaveAttribute('datetime','2026-10-22T05:04:00.000Z');await expect(summary).toContainText('遅延／運休は未反映');
 const second=await page.locator('.vertical-train').nth(1).locator('time').innerText(),next=page.getByRole('button',{name:'条件に合う一本後',exact:true});await next.focus();await next.press('Enter');await expect(page.locator('.chosen-service')).toContainText(second);await expect(page.locator('.chosen-decision')).toBeFocused();await expect(page.locator('.vertical-train').nth(1)).toHaveAttribute('aria-pressed','true');
 expect(await page.locator('.chosen-remaining').evaluate(e=>!!e.closest('[aria-live="polite"],[aria-live="assertive"],[role="status"],[role="alert"]'))).toBe(false);const announced=await page.locator('.sr-only[role=status]').textContent();await page.clock.fastForward(1000);await expect(page.locator('.sr-only[role=status]')).toHaveText(announced!);
});

test('denied location opens measured fallback and returns focus to the result after saving',async({page})=>{
 await page.evaluate(()=>{navigator.geolocation.watchPosition=(_s,error)=>{error?.({code:1,message:'Mock denial',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};});await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await expect(page.locator('.location-status')).toContainText('拒否');await closeWalkingSettings(page);await expect(page.locator('.decision-location-note')).toContainText('拒否');await expect(page.locator('.chosen-leave')).toHaveCount(0);
 await saveMeasuredPlace(page,'試験地点');await expect(page.locator('.chosen-decision')).toContainText('登録地点「試験地点」');await expect(page.locator('.chosen-remaining')).toHaveText('4分00秒');await expect(page.locator('.chosen-decision')).toBeFocused();await openWalkingSettings(page);await expect(page.locator('.walk-summary')).toContainText('登録地点の実測時間');await closeWalkingSettings(page);
});

test('expired data is not offered as an available fallback and has no deadline',async({page})=>{
 await actualTime(page,'2026-12-01T14:00:00+09:00');await expect(page.locator('.decision-empty')).toContainText('要再確認');await expect(page.getByRole('button',{name:'取得済みの学園都市を表示'})).toHaveCount(0);await expect(page.locator('.chosen-leave')).toHaveCount(0);
});

test('actual decision text contrast and primary touch targets satisfy accessibility thresholds',async({page})=>{
 await locate(page);const ratios=await page.locator('.decision-summary').evaluate(root=>{
 const lum=(text:string)=>text.match(/[\d.]+/g)!.slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
 const surface=(e:Element):string=>{let p:Element|null=e;while(p){const c=getComputedStyle(p).backgroundColor,v=c.match(/[\d.]+/g)?.map(Number)??[];if(v.length===3||v[3]===1)return c;if(v.length===4&&v[3]!==0)throw Error('Unexpected translucent surface');p=p.parentElement;}return 'rgb(255,255,255)';};
 return ['.station-trigger strong','.chosen-service strong','.chosen-remaining b','.chosen-leave time','.chosen-disclaimer'].map(s=>{const e=root.querySelector(s)!,f=lum(getComputedStyle(e).color),b=lum(surface(e));return (Math.max(f,b)+.05)/(Math.min(f,b)+.05);});});for(const ratio of ratios)expect(ratio).toBeGreaterThanOrEqual(4.5);
 for(const label of ['条件に合う一本後','徒歩時間'])expect((await page.getByRole('button',{name:label,exact:true}).first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('three, one and zero candidates, departed choice and foreground refresh use JST',async({page})=>{
 await page.route('**/api/jr?*',async route=>{const data=dailyFixture('2026-10-22');data.tables=data.tables.map(t=>({...t,departures:['14:05','14:15','14:25'].map(time=>({time,destination:'模擬終点',trainType:'普通',platform:null}))}));await route.fulfill({json:data});});await chooseStation(page,'jr-osaka');await expect(page.locator('.vertical-train')).toHaveCount(3);await page.getByRole('button',{name:'条件に合う一本後',exact:true}).click();await expect(page.locator('.chosen-service')).toContainText('14:15');await actualTime(page,'2026-10-22T14:16:00+09:00');await expect(page.locator('.vertical-train')).toHaveCount(1);await expect(page.locator('.selection-notice')).toContainText('予定発車時刻を過ぎた');await expect(page.locator('.chosen-service')).toContainText('14:25');await expect(page.getByRole('button',{name:'条件に合う一本後'})).toBeDisabled();await actualTime(page,'2026-10-22T14:25:00+09:00');await expect(page.locator('.vertical-train')).toHaveCount(0);await expect(page.locator('.decision-empty')).toContainText('便は終了');await expect(page.locator('.chosen-leave')).toHaveCount(0);
});

test('320px and doubled text retain bounds and a non-color selected direction',async({page})=>{
 await locate(page);await page.setViewportSize({width:320,height:800});await page.evaluate(()=>document.documentElement.style.fontSize='28px');await expect(page.getByRole('button',{name:'北大路・国際会館方面'})).toHaveAttribute('aria-pressed','true');for(const selector of ['html','.decision-summary','.chosen-remaining','.chosen-leave'])expect(await page.locator(selector).evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

for(const fault of ['wrong-origin','future-time'] as const)test(`rejects ${fault} route responses before displaying a deadline`,async({page})=>{
 await page.route('**/api/walking',async route=>{const body=route.request().postDataJSON();await route.fulfill({json:{kind:'route',entranceId:body.entranceId,origin:fault==='wrong-origin'?{lat:34,lon:135}:body.origin,distanceMeters:80,roadDistanceMeters:80,durationSeconds:60,snapDistances:[0,0],geometry:[[135,35],[135,35.001]],steps:[],fetchedAt:FIXED_TIME.getTime()+(fault==='future-time'?3600000:0),provider:'test',cached:false,dataVersion:null}});});await installGps(page);await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await expect(page.locator('.route-error')).toContainText('応答を検証できません');await expect(page.locator('.chosen-leave')).toHaveCount(0);
});
