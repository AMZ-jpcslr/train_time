import {test,expect} from '@playwright/test';
import {chooseStation,mockRuntime} from '../fixtures/runtime';

test('a distant measured place opens a reachable train beyond five and browses the entire acquired service day',async({page},info)=>{
 const time=new Date('2026-10-23T14:00:00+09:00');await page.clock.install({time:new Date(time.getTime()-60000)});await page.clock.pauseAt(time);
 if(!process.env.JOURNEY_URL)await mockRuntime(page);
 let walking=0;await page.route('**/api/walking',route=>{walking++;return route.abort();});
 await page.addInitScript(()=>{navigator.geolocation.watchPosition=()=>{throw Error('This scenario must not request GPS');};navigator.geolocation.getCurrentPosition=()=>{throw Error('This scenario must not request GPS');};});
 await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();
 await page.getByRole('button',{name:'実測時間を使う',exact:true}).click();await page.getByLabel('地点名',{exact:true}).fill('比較用の架空地点');await page.getByLabel('到着する駅入口',{exact:true}).fill('確認用入口');await page.getByLabel('入口までの実測徒歩時間（分）',{exact:true}).fill('60');await page.getByRole('button',{name:'端末に保存して使う'}).click();await page.clock.runFor(100);
 await expect(page.locator('.decision-train')).toContainText('15:08 発');await expect(page.locator('.stay-countdown')).toContainText('5分');await expect(page.locator('.stay-deadline')).toContainText('14:05:00');
 expect(await page.locator('.train-choice').count()).toBeGreaterThan(5);expect(await page.locator('.departure-card .comfortable,.departure-card .tight').count()).toBeGreaterThanOrEqual(3);
 await expect(page.locator('.rail-disclaimer')).toContainText('実位置ではありません');
 await page.screenshot({path:`docs/screenshots/timeline-20261023/${process.env.JOURNEY_CAPTURE??'local'}-${info.project.name}-long-walk.png`});
 const strip=page.locator('.timeline-strip');await strip.focus();await strip.press('Home');await page.clock.runFor(100);await expect(page.locator('.departure-card').first()).toBeInViewport();await expect(page.locator('.past-choice').first()).toBeDisabled();
 const before=await page.locator('.rail-caption').innerText();await strip.press('ArrowRight');await page.clock.runFor(100);expect(await page.locator('.rail-caption').innerText()).not.toBe(before);
 await strip.press('End');await page.clock.runFor(100);await expect(page.locator('.departure-card').last()).toBeInViewport();await page.getByRole('button',{name:'現在付近へ',exact:true}).click();await page.clock.runFor(100);await expect(page.locator('.train-choice').first()).toBeInViewport();
 await page.getByRole('button',{name:'出発に余裕のある便へ'}).click();await page.clock.runFor(100);await expect(page.locator('.departure-card.is-selected')).toBeInViewport();
 expect(await page.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(walking).toBe(0);
});
