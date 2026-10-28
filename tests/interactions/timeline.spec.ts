import {test,expect,type Page} from '@playwright/test';
import {chooseStation,mockRuntime,saveMeasuredPlace,openWalkingSettings,closeWalkingSettings} from '../fixtures/runtime';
async function setup(page:Page,measured=true){
 await page.clock.setFixedTime(new Date('2026-10-22T14:00:00+09:00'));await mockRuntime(page);await page.addInitScript(()=>{navigator.geolocation.watchPosition=(_s,e)=>{e?.({code:1,message:'mock denied',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};});await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();if(measured)await saveMeasuredPlace(page,'検証用の架空地点');
}
// The normal UI now has a vertical list. Test browsing/selection invariants with
// live timers instead of retaining snap/rail mechanics from the retired layout.
test('selection synchronizes immediately while vertical browsing preserves choice and deadline',async({page})=>{
 await setup(page);const rows=page.locator('.vertical-train'),target=rows.nth(6),time=await target.locator('time').textContent();await target.click();await expect(target).toHaveAttribute('aria-pressed','true');await expect(page.locator('.chosen-service')).toContainText(time!);await expect(page.locator('.chosen-decision')).toBeFocused();const deadline=await page.locator('.chosen-leave').textContent();await rows.last().scrollIntoViewIfNeeded();await expect(rows.last()).toBeInViewport();await rows.first().scrollIntoViewIfNeeded();await expect(rows.first()).toBeInViewport();await expect(page.locator('.chosen-service')).toContainText(time!);await expect(page.locator('.chosen-leave')).toHaveText(deadline!);expect(await rows.evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=44))).toBe(true);
});

test('native touch scrolling or keyboard page browsing never selects a different train',async({page,context,browserName})=>{
 await setup(page);await page.locator('.vertical-train').nth(2).click();const selected=await page.locator('.chosen-service').textContent(),deadline=await page.locator('.chosen-leave').textContent();await page.locator('.vertical-train').first().scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY+document.querySelector('.vertical-trains')!.scrollTop);
 if(browserName==='chromium'){
  const session=await context.newCDPSession(page),x=page.viewportSize()!.width/2,navTop=(await page.locator('.action-bottom-nav').boundingBox())?.y??page.viewportSize()!.height,y=Math.min(page.viewportSize()!.height*.7,navTop-40);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=12;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*30}]});await page.waitForTimeout(20);}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
 }else{await page.locator('.vertical-train').first().focus();await page.keyboard.press('PageDown');}
 await expect.poll(()=>page.evaluate(()=>scrollY+document.querySelector('.vertical-trains')!.scrollTop)).toBeGreaterThan(before+50);await expect(page.locator('.chosen-service')).toHaveText(selected!);await expect(page.locator('.chosen-leave')).toHaveText(deadline!);
});

test('location refusal recovers through measured walking and an explicit later choice beyond five',async({page})=>{
 await setup(page,false);await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();await expect(page.locator('.location-status')).toContainText('拒否');await closeWalkingSettings(page);await expect(page.locator('.chosen-leave')).toHaveCount(0);await saveMeasuredPlace(page,'遠い架空地点','60');await expect(page.locator('.chosen-service')).toContainText('14:08');await expect(page.locator('.chosen-remaining')).toHaveText('出発目安を過ぎています');await page.locator('.vertical-train').filter({has:page.locator('time',{hasText:'15:08'})}).click();await expect(page.locator('.chosen-leave time')).toHaveText('14:05');await expect(page.locator('.chosen-remaining')).toHaveText('5分00秒');
});

test('reduced motion and keyboard access retain full service names without overflow',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await setup(page);await chooseStation(page,'hankyu-umeda');const row=page.locator('.vertical-train').filter({hasText:'準特急'}).first(),time=await row.locator('time').textContent();await row.focus();await row.press('Enter');await expect(page.locator('.chosen-service')).toContainText('準特急');await expect(page.locator('.chosen-service')).toContainText(time!);await expect(page.locator('.chosen-decision')).toBeFocused();expect(await row.evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');expect(await page.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

test('repeated next selection and direction change finish at the intended train',async({page})=>{
 await setup(page);const rows=page.locator('.vertical-train'),third=await rows.nth(2).locator('time').textContent(),next=page.getByRole('button',{name:'条件に合う一本後',exact:true});await next.click();await next.click();await expect(page.locator('.chosen-service')).toContainText(third!);await expect(rows.nth(2)).toHaveAttribute('aria-pressed','true');await next.click();await page.getByRole('button',{name:'京都・竹田・近鉄奈良方面'}).click();await expect(rows.first()).toHaveAttribute('aria-pressed','true');await expect(page.locator('.selection-mode')).toHaveText('条件に合う次の電車');await expect(page.getByRole('button',{name:'自動選択に戻す'})).toBeDisabled();
});

test('route accents and service names remain accurate when switching JR and Hankyu',async({page})=>{
 await setup(page,false);await chooseStation(page,'jr-osaka');await expect(page.locator('.app-shell')).toHaveCSS('--rail-color','#0079bd');await page.locator('.vertical-train').filter({hasText:'新快速'}).first().click();await expect(page.locator('.chosen-service')).toContainText('新快速');await chooseStation(page,'hankyu-umeda');await expect(page.locator('.app-shell')).toHaveCSS('--rail-color','#31465b');await page.locator('.vertical-train').filter({hasText:'準特急'}).first().click();await expect(page.locator('.chosen-service')).toContainText('準特急');expect(await page.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});
