import {test,expect} from '@playwright/test';
import {FIXED_TIME,mockRuntime} from '../fixtures/runtime';

test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60_000)});await page.clock.pauseAt(FIXED_TIME);});

test('custom station chooser searches lines, selects stations and restores focus',async({page},info)=>{
 const api=await mockRuntime(page);await page.goto('/');
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
 await mockRuntime(page);await page.goto('/');
 const trigger=page.getByRole('button',{name:'乗車駅',exact:true});await trigger.focus();await trigger.press('Enter');
 const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'}),search=dialog.getByLabel('駅名・路線で検索');
 await search.fill('阪神');await search.press('ArrowDown');await page.keyboard.press('Enter');await expect(trigger).toContainText('阪神甲子園');
 await trigger.click();await search.fill('神戸市営');await search.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Enter');await expect(trigger).toContainText('妙法寺');
 await trigger.click();await search.fill('存在しない駅');await expect(dialog.locator('[data-station-id]')).toHaveCount(0);await expect(dialog).toContainText('一致する駅がありません');
 await search.press('Tab');await expect(dialog.getByRole('button',{name:'駅選択を閉じる'})).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();await expect(trigger).toContainText('妙法寺');
});

test('location action appears before the departure board and fits a narrow phone',async({page},info)=>{
 const api=await mockRuntime(page);await page.goto('/');
 const check=async()=>{
  const action=await page.getByRole('button',{name:'現在地を更新',exact:true}).boundingBox();
  const board=await page.locator('.board-section').boundingBox();
  expect(action).not.toBeNull();expect(board).not.toBeNull();expect(action!.y+action!.height).toBeLessThan(board!.y);
  expect(action!.y+action!.height).toBeLessThan(page.viewportSize()!.height);expect(action!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 };
 await check();await page.screenshot({path:`docs/screenshots/${info.project.name}-location-top.png`,fullPage:true});
 await page.setViewportSize({width:320,height:640});await check();
 await page.getByRole('button',{name:'乗車駅',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});const box=(await dialog.boundingBox())!;
 expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);expect(box.y+box.height).toBeLessThanOrEqual(641);
 await dialog.getByLabel('駅名・路線で検索').fill('阪急');await expect(dialog.locator('[data-station-id]')).toHaveCount(3);
 expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);expect(api.walking).toHaveLength(0);
});
