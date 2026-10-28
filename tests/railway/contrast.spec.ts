import {setMinutes,locationSettings} from './walking-helpers';
import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,openWalkingSettings} from '../fixtures/runtime';
import {contrast} from './contrast-helpers';
test('railway readable text in the main display and walking dialog',async({page})=>{
 await page.clock.install({time:FIXED_TIME});await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');
 await setMinutes(page);
 expect(await contrast(page)).toEqual([]);const dialog=await locationSettings(page);expect(await contrast(page)).toEqual([]);await dialog.getByRole('button',{name:'徒歩時間を入力',exact:true}).click();expect(await contrast(page)).toEqual([]);const advanced=dialog.locator('.rail-setup-help').last();await advanced.locator(':scope > summary').click();await dialog.locator('.manual-fallback > summary').click();await dialog.locator('.place-form > summary').click();expect(await contrast(page)).toEqual([]);
});
