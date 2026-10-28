import {test,expect,type Locator,type Page} from '@playwright/test';
import {contrast} from './contrast-helpers';
import {mkdir} from 'node:fs/promises';
import {FIXED_TIME,mockRuntime,chooseChoice} from '../fixtures/runtime';
async function visibleTarget(button:Locator){
 await expect(button).toBeInViewport();
 expect(await button.evaluate(element=>{const r=element.getBoundingClientRect(),clip=element.closest('.station-dialog-content')!.getBoundingClientRect();const top=Math.max(r.top,clip.top,0),bottom=Math.min(r.bottom,clip.bottom,innerHeight);return bottom-top>=44&&element.contains(document.elementFromPoint((r.left+r.right)/2,(top+bottom)/2));})).toBe(true);
}
async function noBottomGap(page:Page){
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 expect(await page.locator('.action-bottom-nav').evaluate(element=>Math.abs(element.getBoundingClientRect().bottom-innerHeight)<=1)).toBe(true);
 expect(await page.evaluate(()=>!!document.elementFromPoint(innerWidth/2,innerHeight-6)?.closest('.action-bottom-nav'))).toBe(true);
}
for(const size of [{width:320,height:640},{width:390,height:844},{width:1440,height:900}])test(`station results remain visible and selectable at ${size.width}`,async({page},info)=>{
 await page.setViewportSize(size);await page.clock.install({time:FIXED_TIME});await mockRuntime(page);await page.goto('/');await noBottomGap(page);
 const trigger=page.getByRole('button',{name:'乗車駅',exact:true});await trigger.click();const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ',exact:true});
 await visibleTarget(dialog.locator('[data-station-id]').first());const input=dialog.getByLabel('駅名・路線で検索');await input.fill('今出川');const result=dialog.locator('[data-station-id="kyoto-imadegawa"]');await visibleTarget(result);expect(await contrast(page)).toEqual([]);
 if(info.project.name==='desktop'){await mkdir('docs/railway-live/screenshots',{recursive:true});await page.screenshot({path:`docs/railway-live/screenshots/station-fixed-${size.width}.png`});}
 if(info.project.name==='mobile')await result.tap();else await result.click();await expect(dialog).not.toBeVisible();await expect(trigger).toContainText('今出川');await expect(page.locator('.rail-board-context')).toContainText('今出川');await expect(page.locator('.vertical-train').first()).toContainText('14:02');await noBottomGap(page);
 await trigger.click();await input.fill('JR');await expect(dialog.locator('[data-station-id]')).toHaveCount(40);const total=Number((await dialog.locator('.station-result-count').innerText()).match(/^\d+/)![0]);expect(total).toBeGreaterThan(40);const more=dialog.getByRole('button',{name:/さらに40件を表示/});await more.scrollIntoViewIfNeeded();if(info.project.name==='mobile')await more.tap();else await more.click();await expect(dialog.locator('[data-station-id]')).toHaveCount(Math.min(80,total));
 await input.press('ArrowDown');await page.keyboard.press('End');const last=dialog.locator('[data-station-id]').last(),name=await last.locator('strong').innerText();await expect(last).toBeFocused();await visibleTarget(last);await page.keyboard.press('Enter');await expect(dialog).not.toBeVisible();await expect(trigger).toContainText(name);await expect(page.locator('.rail-board-context')).toContainText(name);await noBottomGap(page);
 await trigger.click();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();await noBottomGap(page);
});
test('station filters, nested menus and reduced viewport keep results reachable',async({page})=>{
 await page.setViewportSize({width:390,height:650});await page.clock.install({time:FIXED_TIME});await mockRuntime(page);await page.goto('/railway.html');const trigger=page.getByRole('button',{name:'乗車駅',exact:true});await trigger.click();const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ',exact:true});
 await dialog.getByLabel('駅名・路線で検索').press('Shift+Tab');await expect(dialog.getByRole('button',{name:'駅選択を閉じる',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(dialog.locator('.station-more-sources>summary')).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'駅選択を閉じる',exact:true})).toBeFocused();
 await dialog.locator('.station-refinements>summary').click();await chooseChoice(page,'地域','関西');await chooseChoice(page,'会社','阪急電鉄');await dialog.locator('.station-refinements>summary').click();const first=dialog.locator('[data-station-id]').first();await visibleTarget(first);
 const firstName=await first.locator('strong').innerText();await dialog.getByLabel('駅名・路線で検索').fill(firstName);await page.setViewportSize({width:390,height:320});await expect.poll(async()=>{const box=(await dialog.boundingBox())!;return box.y>=0&&box.y+box.height<=321;}).toBe(true);
 await dialog.getByLabel('駅名・路線で検索').press('ArrowDown');await visibleTarget(dialog.locator('[data-station-id]').first());await page.keyboard.press('Enter');await expect(dialog).not.toBeVisible();await expect(trigger).toContainText(firstName);await noBottomGap(page);
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});for(let n=0;n<3;n++){await trigger.click();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();}await noBottomGap(page);expect(await page.locator('dialog[open]').count()).toBe(0);
});
