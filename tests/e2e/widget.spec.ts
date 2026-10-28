import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {FIXED_TIME,mockRuntime,chooseStation,locate,previewAt,openWalkingSettings} from '../fixtures/runtime';
test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);await mockRuntime(page);});
for(const platform of ['android','ios'])test(`${platform} explicitly exports the selected train without coordinates and waits for acknowledgement`,async({page})=>{
 await page.addInitScript(platform=>{const w=window as unknown as Record<string,unknown>;w.__snapshots=[];const bridge={postMessage:(json:string)=>(w.__snapshots as unknown[]).push(JSON.parse(json))};if(platform==='android')w.ManiauWidget=bridge;else w.webkit={messageHandlers:{maniauWidget:bridge}};},platform);
 await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await locate(page);await page.locator('.vertical-train').nth(2).click();expect(await page.evaluate(()=>(window as unknown as {__snapshots:unknown[]}).__snapshots.length)).toBe(0);
 await page.getByRole('button',{name:'選んだ電車をウィジェットに保存'}).click();await expect(page.locator('.widget-transfer [role=status]')).toContainText('保存しています');
 const data=await page.evaluate(()=>(window as unknown as {__snapshots:Record<string,unknown>[]}).__snapshots[0]);expect(data.walkMinutes).toBe(1);expect(JSON.stringify(data)).not.toMatch(/"(?:lat|lon|bufferMinutes)"/);expect(data.selectedDepartureId).toBe((data.departures as {id:string}[])[2].id);
 if(platform==='android'){mkdirSync('.cache/verification',{recursive:true});writeFileSync('.cache/verification/widget-web-snapshot.json',JSON.stringify(data,null,2));}
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('maniauwidgetresult',{detail:{ok:true}})));await expect(page.locator('.widget-transfer [role=status]')).toContainText('保存しました');
 await previewAt(page,'2026-10-22T15:00');await expect(page.getByRole('button',{name:'選んだ電車をウィジェットに保存'})).toBeDisabled();
});
test('bridge failure and no acknowledgement are not reported as saved',async({page})=>{
 await page.addInitScript(()=>Object.assign(window,{ManiauWidget:{postMessage:()=>{}}}));await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'選んだ電車をウィジェットに保存'}).click();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('maniauwidgetresult',{detail:{ok:false}})));await expect(page.locator('.widget-transfer [role=status]')).toContainText('保存できませんでした');
 await page.getByRole('button',{name:'選んだ電車をウィジェットに保存'}).click();await page.clock.fastForward(5001);await expect(page.locator('.widget-transfer [role=status]')).toContainText('保存結果を確認できません');
});
test('malformed route origin shows a recoverable error instead of crashing the page',async({page})=>{
 await page.route('**/api/walking',route=>route.fulfill({json:{kind:'route',entranceId:route.request().postDataJSON().entranceId,distanceMeters:80,roadDistanceMeters:80,durationSeconds:60,fetchedAt:FIXED_TIME.getTime(),snapDistances:[0,0],geometry:[[135,35],[135,35.001]]}}));
 await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');
 const {installGps}=await import('../fixtures/runtime');await installGps(page);await openWalkingSettings(page);await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
 await expect(page.locator('.route-error')).toContainText('応答を検証できません');await expect(page.locator('.chosen-decision')).toBeVisible();await expect(page.locator('.chosen-remaining')).toHaveCount(0);
});
