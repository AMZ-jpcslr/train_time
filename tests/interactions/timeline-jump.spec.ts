import {test,expect,type Page} from '@playwright/test';
import {chooseStation,mockRuntime,saveMeasuredPlace,openWalkingSettings} from '../fixtures/runtime';
async function setup(page:Page){await page.clock.setFixedTime(new Date('2026-10-22T14:00:00+09:00'));await mockRuntime(page);await page.goto('/classic.html');await chooseStation(page,'kyoto-imadegawa');await saveMeasuredPlace(page,'検証用の架空地点');}
// Replace retired horizontal snap-correction scenarios with current live-timer
// sheet cancellation/reentry invariants. No production comparison entry is used.
for(const method of ['Escape','close','back'] as const)test(`walking sheet ${method} restores focus and preserves the selected train`,async({page})=>{
 await setup(page);await page.locator('.vertical-train').nth(2).click();const chosen=await page.locator('.chosen-service').textContent(),deadline=await page.locator('.chosen-leave').textContent(),trigger=page.getByRole('button',{name:'徒歩時間',exact:true}).first();await trigger.click();const sheet=page.getByRole('dialog',{name:'徒歩時間・駅構内の設定'});await expect(sheet).toBeVisible();if(method==='Escape')await page.keyboard.press('Escape');else if(method==='back')await page.goBack();else await sheet.getByRole('button',{name:'閉じる',exact:true}).click();await expect(sheet).not.toBeVisible();await expect(trigger).toBeFocused();await expect(page.locator('.chosen-service')).toHaveText(chosen!);await expect(page.locator('.chosen-leave')).toHaveText(deadline!);await trigger.click();await expect(sheet).toBeVisible();await sheet.getByRole('button',{name:'閉じる',exact:true}).click();await expect(sheet).not.toBeVisible();
});

test('nested entrance choice Escape closes only that choice and restores its parent sheet',async({page})=>{
 await setup(page);await openWalkingSettings(page);const sheet=page.getByRole('dialog',{name:'徒歩時間・駅構内の設定'}),trigger=sheet.getByRole('button',{name:'歩いて向かう駅入口',exact:true});await trigger.click();const child=page.getByRole('dialog',{name:'歩いて向かう駅入口を選ぶ'});await expect(child).toBeVisible();await page.keyboard.press('Escape');await expect(child).not.toBeVisible();await expect(sheet).toBeVisible();await expect(trigger).toBeFocused();await sheet.getByRole('button',{name:'閉じる',exact:true}).click();await expect(sheet).not.toBeVisible();
});

test('rapid reentry and keyboard selection never leave invisible modal state',async({page})=>{
 await setup(page);const trigger=page.getByRole('button',{name:'徒歩時間',exact:true}).first(),sheet=page.getByRole('dialog',{name:'徒歩時間・駅構内の設定'});for(let i=0;i<3;i++){await trigger.click();await expect(sheet).toBeVisible();await page.keyboard.press('Escape');await expect(sheet).not.toBeVisible();}const row=page.locator('.vertical-train').nth(1),time=await row.locator('time').textContent();await row.focus();await row.press('Enter');await expect(page.locator('.chosen-service')).toContainText(time!);await expect(page.locator('.chosen-decision')).toBeFocused();expect(await page.locator('dialog[open]').count()).toBe(0);
});

// Hold one real history traversal to reproduce a slow browser's modal handoff.
// The app must queue the new sheet rather than letting the old Back close it.
test('a delayed station-close traversal cannot cancel the next walking sheet',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-22T14:00:00+09:00'));await mockRuntime(page);await page.goto('/classic.html');
 await page.evaluate(()=>{const back=history.back.bind(history);let held=false;Object.assign(window,{__releaseModalBack:()=>{},__modalBackPending:false});history.back=()=>{if(held){back();return;}held=true;Object.assign(window,{__modalBackPending:true,__releaseModalBack:back});};addEventListener('popstate',()=>Object.assign(window,{__modalBackPending:false}));});
 await chooseStation(page,'kyoto-imadegawa',false);await page.getByRole('button',{name:'北大路・国際会館方面'}).click();await page.getByRole('button',{name:'徒歩時間',exact:true}).first().click();await page.evaluate(()=>(window as unknown as {__releaseModalBack:()=>void}).__releaseModalBack());await expect.poll(()=>page.evaluate(()=>(window as unknown as {__modalBackPending:boolean}).__modalBackPending)).toBe(false);
 const sheet=page.getByRole('dialog',{name:'徒歩時間・駅構内の設定',exact:true});await expect(sheet).toBeVisible();await sheet.getByLabel('駅入口までの徒歩時間（分）').fill('2');await sheet.getByRole('button',{name:'この徒歩時間で見る'}).click();await expect(sheet).not.toBeVisible();await expect(page.locator('.chosen-leave time')).toHaveText('14:03');await expect(page.locator('.chosen-remaining')).toHaveText('3分00秒');
});
