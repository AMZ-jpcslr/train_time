import {setMinutes,manualSettings} from './walking-helpers';
import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {FIXED_TIME,mockRuntime,chooseStation,openWalkingSettings} from '../fixtures/runtime';
test('railway actual app: responsive layout, chosen train, settings and reduced motion',async({page},info)=>{
 await page.clock.install({time:FIXED_TIME});await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');
 await setMinutes(page);
 await expect(page.locator('.rail-board-service')).toBeVisible();
 for(const width of [320,375,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`page overflow ${width}`).toBe(true);
  expect(await page.locator('.rail-board,.rail-ticket,.decision-controls,.vertical-train,.settings-sheet[open]').evaluateAll(elements=>elements.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className)),`component overflow ${width}`).toEqual([]);
  await manualSettings(page);
  expect(await page.locator('.settings-sheet,.minute-wheel-controls,.rail-mode-buttons').evaluateAll(elements=>elements.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className)),`walking setup overflow ${width}`).toEqual([]);
  expect(await page.locator('.settings-sheet[open]>header').evaluate(header=>{const title=header.querySelector('h2')!.getBoundingClientRect(),close=header.querySelector('button')!.getBoundingClientRect();return title.right<=close.left+1;}),`walking setup header overlap ${width}`).toBe(true);
  await page.keyboard.press('Escape');
 }
 if(info.project.name==='desktop'){
  await mkdir('docs/railway-live/screenshots',{recursive:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/railway-live/screenshots/mobile.png',fullPage:true,animations:'disabled'});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'docs/railway-live/screenshots/desktop.png',fullPage:true,animations:'disabled'});
 }
 const first=page.locator('.vertical-train').nth(1);await first.click();await expect(page.locator('.rail-ticket .selection-mode')).toContainText('選んだ');
 await page.getByRole('button',{name:'条件に合う一本後',exact:true}).click();await expect(page.locator('.rail-ticket .selection-mode')).toContainText('選んだ');await page.getByRole('button',{name:'自動選択に戻す',exact:true}).click();await expect(page.locator('.rail-ticket .selection-mode')).toContainText('自動選択');
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.rail-ticket').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await openWalkingSettings(page);await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'徒歩時間・駅構内の設定',exact:true})).not.toBeVisible();
});
