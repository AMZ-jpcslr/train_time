import {setMinutes,locationSettings} from './walking-helpers';
import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,chooseStation,openWalkingSettings} from '../fixtures/runtime';
test('split flap only follows a scheduled departure, never an arbitrary manual choice',async({page})=>{
 await page.clock.install({time:new Date(FIXED_TIME.getTime()-60000)});await page.clock.pauseAt(FIXED_TIME);await mockRuntime(page);await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await setMinutes(page);
 await page.locator('.vertical-train').first().click();await expect(page.locator('.rail-ticket .rail-flap')).toHaveCount(0);
 const value=(await page.locator('.rail-ticket .chosen-service>strong').innerText()).trim(),[hours,minutes]=value.split(':').map(Number);
 const epoch=Date.parse('2026-10-22T00:00:00+09:00')+(hours*60+minutes)*60000;
 await page.clock.fastForward(epoch-FIXED_TIME.getTime()+1000);
 await expect(page.locator('.rail-ticket .chosen-service>strong')).not.toHaveText(value);await expect(page.locator('.rail-ticket .rail-flap')).toHaveCount(1);
 await page.clock.fastForward(400);await expect(page.locator('.rail-ticket .rail-flap')).toHaveCount(0);
});
