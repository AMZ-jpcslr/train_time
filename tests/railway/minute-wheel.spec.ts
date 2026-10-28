import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,installControlledGps,emitGps,gpsWatchState,closeWalkingSettings} from '../fixtures/runtime';
import {manualSettings,locationSettings,setMinutes} from './walking-helpers';
test.beforeEach(async({page})=>{await page.clock.install({time:FIXED_TIME});await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await installControlledGps(page);});
test('minutes wheel supports keys, half minutes, valid bounds and explicit apply',async({page})=>{
 const dialog=await manualSettings(page),wheel=dialog.getByRole('spinbutton',{name:'駅入口までの徒歩時間',exact:true}),direct=dialog.getByRole('spinbutton',{name:'駅入口までの徒歩時間（分）',exact:true});
 expect((await gpsWatchState(page)).count).toBe(0);
 await wheel.focus();await wheel.press('Home');await expect(wheel).toHaveAttribute('aria-valuenow','0');await expect(dialog.getByRole('button',{name:'徒歩を1分減らす'})).toBeDisabled();
 await wheel.press('ArrowUp');await wheel.press('PageUp');await expect(wheel).toHaveAttribute('aria-valuenow','11');
 await dialog.getByRole('checkbox',{name:'30秒を加える'}).check();await expect(direct).toHaveValue('11.5');
 await direct.fill('2.5');await expect(wheel).toHaveAttribute('aria-valuenow','2');await expect(wheel).toHaveAttribute('aria-valuetext','2分30秒');
 await wheel.press('End');await expect(direct).toHaveValue('240');await expect(dialog.getByRole('checkbox',{name:'30秒を加える'})).toBeDisabled();
 await direct.fill('241');await dialog.getByRole('button',{name:'この分数で設定',exact:true}).click();await expect(dialog).toBeVisible();await expect(dialog.getByRole('alert')).toContainText('0〜240分');
 await direct.fill('3.5');await expect(page.locator('.rail-ticket .chosen-leave')).toHaveCount(0);await dialog.getByRole('button',{name:'3分30秒で設定',exact:true}).click();
 await expect(dialog).not.toBeVisible();await expect(page.locator('.rail-board-note')).toContainText('3.5分');await expect(page.locator('.rail-ticket .chosen-leave')).toBeVisible();expect((await gpsWatchState(page)).count).toBe(0);
});
test('wheel changes require focus and do not hijack the settings scroll',async({page})=>{
 await page.setViewportSize({width:390,height:740});const dialog=await manualSettings(page),wheel=dialog.getByRole('spinbutton',{name:'駅入口までの徒歩時間',exact:true});
 await dialog.getByRole('spinbutton',{name:'駅入口までの徒歩時間（分）',exact:true}).fill('8');await dialog.getByRole('button',{name:'徒歩時間を入力',exact:true}).focus();
 await wheel.hover();await page.mouse.wheel(0,110);await expect(wheel).toHaveAttribute('aria-valuenow','8');
 await wheel.scrollIntoViewIfNeeded();await wheel.focus();await wheel.hover();await page.mouse.wheel(0,60*await page.evaluate(()=>devicePixelRatio)); // CDP scales wheel deltas on mobile emulation.
 await expect(wheel).toHaveAttribute('aria-valuenow','9');
 await wheel.scrollIntoViewIfNeeded();const box=(await wheel.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height*.7-60,{steps:6});await page.mouse.up();await expect(wheel).toHaveAttribute('aria-valuenow','10');
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.minute-wheel-numbers').evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
});
test('opening modes does not request GPS; manual apply alone stops an active watch',async({page})=>{
 await setMinutes(page,'2');await locationSettings(page);expect((await gpsWatchState(page)).count).toBe(0);
 await page.getByRole('button',{name:'位置情報で更新を始める',exact:true}).click();await emitGps(page,10);await expect(page.locator('.rail-gps-duration')).toContainText('1分');
 await page.getByRole('dialog').getByRole('button',{name:'徒歩時間を入力',exact:true}).click();expect((await gpsWatchState(page)).cleared).toEqual([]);await page.getByRole('spinbutton',{name:'駅入口までの徒歩時間（分）',exact:true}).fill('4');
 await closeWalkingSettings(page);expect((await gpsWatchState(page)).cleared).toEqual([]);
 const dialog=await manualSettings(page);await expect(dialog.getByRole('spinbutton',{name:'駅入口までの徒歩時間（分）',exact:true})).toHaveValue('2');await dialog.getByRole('button',{name:'2分で設定',exact:true}).click();expect((await gpsWatchState(page)).cleared).toEqual([1]);
 await locationSettings(page);await page.getByRole('button',{name:'位置情報で更新を始める',exact:true}).click();await page.evaluate(()=>{(window as any).__controlledGps.watches[1].error({code:1});});await expect(page.locator('.location-status')).toContainText('許可されていません');
 await page.getByRole('dialog').getByRole('button',{name:'徒歩時間を入力',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'駅入口までの徒歩時間（分）',exact:true})).toHaveValue('2');
});
test('repeated keyboard close returns focus; touch drag changes only walking minutes',async({page,browserName})=>{
 await page.setViewportSize({width:390,height:844});
 for(let i=0;i<3;i++){
  await page.getByRole('navigation',{name:'よく使う操作'}).getByRole('button',{name:'徒歩入力',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'駅入口までの徒歩時間',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('navigation',{name:'よく使う操作'}).getByRole('button',{name:'徒歩入力',exact:true})).toBeFocused();
 }
 await manualSettings(page);const wheel=page.getByRole('spinbutton',{name:'駅入口までの徒歩時間',exact:true});await wheel.scrollIntoViewIfNeeded();const old=Number(await wheel.getAttribute('aria-valuenow'));
 if(browserName==='chromium'){
  const box=(await wheel.boundingBox())!,client=await page.context().newCDPSession(page),x=box.x+box.width/2,y=box.y+box.height*.7;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-65}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();await expect(wheel).toHaveAttribute('aria-valuenow',String(old+1));
 }else{
  // WebKit automation has no CDP touch-drag surface; pointer drag and keys are tested above.
  await wheel.focus();await wheel.press('ArrowUp');await expect(wheel).toHaveAttribute('aria-valuenow',String(old+1));
 }
 expect((await gpsWatchState(page)).count).toBe(0);
});
