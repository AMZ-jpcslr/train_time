import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime,closeWalkingSettings,openWalkingSettings} from '../fixtures/runtime';
import {stations} from '../../src/data/stations';

test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60_000)});await page.clock.pauseAt(FIXED_TIME);});

test('custom station chooser searches lines, selects stations and restores focus',async({page},info)=>{
 const api=await mockRuntime(page);await page.goto('/classic.html');
 const trigger=page.getByRole('button',{name:'乗車駅',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});
 await expect(dialog).toBeVisible();await expect(trigger).toHaveAttribute('aria-expanded','true');
 await expect(dialog.getByLabel('駅名・路線で検索')).toBeFocused();
 await expect(dialog.locator('[data-station-id]')).toHaveCount(1);
 await page.screenshot({path:`docs/screenshots/${info.project.name}-station-picker.png`,fullPage:true});
 await dialog.getByLabel('駅名・路線で検索').fill('ＪＲ茨木');
 await expect(dialog.locator('[data-station-id]')).toHaveCount(1);
 await expect(dialog.locator('[data-station-id]')).toContainText('JR西日本 · JR京都線');
 await dialog.locator('[data-station-id]').click();await expect(trigger).toContainText('JR茨木');
 await expect(trigger).toBeFocused();await expect(dialog).not.toBeVisible();
 await trigger.click();await dialog.getByLabel('駅名・路線で検索').fill('烏丸線');
 await dialog.getByLabel('駅名・路線で検索').press('ArrowDown');
 await dialog.locator('[data-station-id]').press('Enter');
 await expect(trigger).toContainText('今出川');
 await page.reload();await expect(trigger).toContainText('今出川');expect(api.external).toEqual([]);
});

test('keyboard selection, no matches, Escape and focus containment work',async({page})=>{
 await mockRuntime(page);await page.goto('/classic.html');
 const trigger=page.getByRole('button',{name:'乗車駅',exact:true});await trigger.focus();await trigger.press('Enter');
 const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'}),search=dialog.getByLabel('駅名・路線で検索');
 await search.fill('阪神');await search.press('ArrowDown');await page.keyboard.press('Enter');await expect(trigger).toContainText('阪神甲子園');
 await trigger.click();await search.fill('神戸市営');
 const results=dialog.locator('[data-station-id]');await expect(results).toHaveCount(stations.filter(s=>s.operator==='神戸市営地下鉄').length);
 const lastId=await results.last().getAttribute('data-station-id'),lastStation=stations.find(s=>s.id===lastId)!;
 await search.press('ArrowDown');await expect(results.first()).toBeFocused();await page.keyboard.press('End');await expect(results.last()).toBeFocused();
 await page.keyboard.press('Enter');await expect(trigger).toContainText(lastStation.name);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mania-u:v1')!).stationId)).toBe(lastId);
 await trigger.click();await search.fill('存在しない駅');await expect(dialog.locator('[data-station-id]')).toHaveCount(0);await expect(dialog).toContainText('一致する駅がありません');
 await search.press('Tab');await expect(dialog.getByRole('button',{name:'地域',exact:true})).toBeFocused();const browse=dialog.getByRole('button',{name:'一覧から対応範囲を探す',exact:true});await browse.focus();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'駅選択を閉じる'})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(browse).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();await expect(trigger).toContainText(lastStation.name);
});

test('walking setup is discoverable and dialogs fit a narrow phone',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/classic.html');
 for(const width of [390,320]){await page.setViewportSize({width,height:640});const setup=page.getByRole('button',{name:'徒歩時間を設定する',exact:true});await expect(setup).toBeVisible();expect((await setup.boundingBox())!.height).toBeGreaterThanOrEqual(44);await openWalkingSettings(page);const dialog=page.getByRole('dialog',{name:'徒歩時間・駅構内の設定'});await expect(dialog.getByRole('button',{name:'現在地を更新',exact:true})).toBeVisible();await dialog.evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished));});const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(641);await closeWalkingSettings(page);}
 await page.getByRole('button',{name:'乗車駅',exact:true}).click();const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});await dialog.evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished));});const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);expect(box.y+box.height).toBeLessThanOrEqual(641);await dialog.getByLabel('駅名・路線で検索').fill('阪急');await expect(dialog.locator('[data-station-id]')).toHaveCount(3);expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(api.walking).toHaveLength(0);
});
