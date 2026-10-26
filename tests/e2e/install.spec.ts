import {test,expect,type Page} from '@playwright/test';
import {chooseStation,FIXED_TIME,mockRuntime} from '../fixtures/runtime';

test.beforeEach(async({page})=>{await page.clock.install({time:new Date(FIXED_TIME.getTime()-60_000)});await page.clock.pauseAt(FIXED_TIME);});

async function installEvent(page:Page,outcome:'accepted'|'dismissed',fails=false){
 await page.evaluate(({outcome,fails})=>{
  const counters=window as typeof window&{__installPrompts?:number};counters.__installPrompts??=0;
  const event=new Event('beforeinstallprompt',{cancelable:true});
  Object.assign(event,{prompt:()=>{counters.__installPrompts!++;return fails?Promise.reject(new Error('Test install failure')):Promise.resolve();},userChoice:Promise.resolve({outcome,platform:'web'})});
  window.dispatchEvent(event);
 },{outcome,fails});
}
async function promptCount(page:Page){return page.evaluate(()=>(window as typeof window&{__installPrompts?:number}).__installPrompts??0);}
async function openInstall(page:Page){await page.getByRole('button',{name:'ホーム画面に追加',exact:true}).click();return page.getByRole('dialog',{name:'ホーム画面に追加',exact:true});}

test('install prompt waits for explicit action and confirms appinstalled separately',async({page})=>{
 const api=await mockRuntime(page);await page.goto('/');await expect(page.getByRole('button',{name:'ホーム画面に追加',exact:true})).toBeVisible();
 await installEvent(page,'accepted');expect(await promptCount(page)).toBe(0);
 const dialog=await openInstall(page);expect(await promptCount(page)).toBe(0);
 await dialog.getByRole('button',{name:'この端末に追加する',exact:true}).click();expect(await promptCount(page)).toBe(1);
 await expect(dialog.getByRole('status')).toContainText('アイコンがあるか確認してください');await expect(dialog.getByRole('button',{name:'この端末に追加する',exact:true})).toHaveCount(0);
 await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));await expect(dialog.getByRole('status')).toContainText('アプリとして追加済み');
 await dialog.getByRole('button',{name:'案内を閉じる',exact:true}).click();await expect(page.getByRole('button',{name:'追加済み・使い方',exact:true})).toBeFocused();expect(api.external).toEqual([]);
});

test('declining consumes a prompt once and keeps manual guidance available',async({page})=>{
 await mockRuntime(page);await page.goto('/');await expect(page.getByRole('button',{name:'ホーム画面に追加',exact:true})).toBeVisible();await installEvent(page,'dismissed');
 const dialog=await openInstall(page);await dialog.getByRole('button',{name:'この端末に追加する',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('今回は追加しませんでした');
 await dialog.getByRole('button',{name:'案内を閉じる',exact:true}).click();await openInstall(page);expect(await promptCount(page)).toBe(1);await expect(dialog.getByRole('button',{name:'この端末に追加する',exact:true})).toHaveCount(0);
 await installEvent(page,'accepted');await dialog.getByRole('button',{name:'この端末に追加する',exact:true}).click();expect(await promptCount(page)).toBe(2);
});

test('iPhone uses Safari instructions and an accessible bottom sheet without an install API',async({page},info)=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});});
 const api=await mockRuntime(page);await page.goto('/');const dialog=await openInstall(page);
 await expect(dialog.getByRole('heading',{name:'iPhone・iPad / Safari'})).toBeVisible();await expect(dialog).toContainText('Webアプリとして開く');await expect(dialog.getByRole('button',{name:'この端末に追加する',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('link',{name:'Appleのホーム画面追加ガイド ↗'})).toHaveAttribute('href','https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios');await expect(dialog).toContainText('別途Android / iPhone用アプリ');
 await page.screenshot({path:`docs/screenshots/${info.project.name}-install-ios.png`});
 const close=dialog.getByRole('button',{name:'追加の案内を閉じる',exact:true});await close.focus();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'案内を閉じる',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'ホーム画面に追加',exact:true})).toBeFocused();expect(api.external).toEqual([]);
});

test('Android without beforeinstallprompt provides browser-menu steps',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'});Object.defineProperty(navigator,'platform',{get:()=> 'Linux armv8l'});});
 await mockRuntime(page);await page.goto('/');const dialog=await openInstall(page);
 await expect(dialog.getByRole('heading',{name:'Android / Chrome'})).toBeVisible();await expect(dialog).toContainText('アプリをインストール');expect(await promptCount(page)).toBe(0);
});

test('standalone launch is already installed',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{get:()=>true});});await mockRuntime(page);await page.goto('/');
 await page.getByRole('button',{name:'追加済み・使い方',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('アプリとして追加済み');
});

test('failed install prompt leaves a clear fallback',async({page})=>{
 await mockRuntime(page);await page.goto('/');await expect(page.getByRole('button',{name:'ホーム画面に追加',exact:true})).toBeVisible();await installEvent(page,'dismissed',true);const dialog=await openInstall(page);
 await dialog.getByRole('button',{name:'この端末に追加する',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('追加画面を開けませんでした');expect(await promptCount(page)).toBe(1);
});

test('entrance picker supports keyboard, focus return, and small screens',async({page},info)=>{
 await mockRuntime(page);await page.goto('/');await chooseStation(page,'jr-ibaraki');
 const trigger=page.getByRole('button',{name:'歩いて向かう駅入口',exact:true});await trigger.click();const dialog=page.getByRole('dialog',{name:'歩いて向かう駅入口を選ぶ'});
 const list=dialog.getByRole('listbox');await expect(list).toBeFocused();await expect(dialog.getByRole('option')).toHaveCount(2);
 const last=dialog.getByRole('option').last(),label=await last.locator('strong').textContent();await page.keyboard.press('End');await page.keyboard.press('Enter');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();await expect(trigger).toContainText(label!);
 await trigger.click();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'歩いて向かう駅入口の選択を閉じる'})).toBeFocused();await page.keyboard.press('Tab');await expect(list).toBeFocused();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
 await page.setViewportSize({width:320,height:640});await trigger.click();const bounds=await dialog.boundingBox();expect(bounds!.width).toBeLessThanOrEqual(320);expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(await dialog.getByRole('option').first().evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:`docs/screenshots/${info.project.name}-entrance-picker-320.png`});
});
