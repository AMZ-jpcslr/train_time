import {test,expect,type Page} from '@playwright/test';
const variants=['board','action','favorites'];
const original=JSON.stringify({stationId:'kyoto-imadegawa',directionId:'north',favorites:['kyoto-imadegawa:north'],places:[],settings:{stationMinutes:5,speedKmh:4}});
async function setup(page:Page){
 await page.clock.install({time:new Date('2026-10-26T14:00:00+09:00')});
 await page.route('**/api/**',route=>route.fulfill({json:{enabled:false,odptChallenge:{enabled:false},western:{enabled:false}}}));
 await page.addInitScript(value=>{if(!localStorage.getItem('mania-u:v1'))localStorage.setItem('mania-u:v1',value);},original);
}
for(const design of variants){
 test(design+' six journeys, saved settings, back, rapid input and screenshots',async({page},info)=>{
  await setup(page);await page.goto('/?design='+design);
  const decision=page.getByRole('region',{name:'出発目安',exact:true});
  await expect(decision).toContainText('ここを出る目安');
  await page.screenshot({path:`docs/screenshots/design-20261026/${design}-${info.project.name}.png`,fullPage:true});
  await page.screenshot({path:`docs/screenshots/design-20261026/${design}-${info.project.name}-viewport.png`});
  const choices=page.locator('.review-train-row');await choices.nth(4).click();await expect(choices.nth(4)).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/徒歩 8分/}).click();await expect(page.getByRole('dialog')).toContainText('余裕は構内時間に含みます');
  await page.getByLabel('駅入口までの実測時間（分）').fill('10');await page.getByRole('button',{name:'この条件で見る'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(decision).toContainText('徒歩 10分');
  await page.getByRole('button',{name:'駅・方面',exact:true}).click();await page.getByRole('searchbox').fill('今出川');await page.getByRole('dialog').getByRole('button',{name:/今出川/}).click();
  await page.getByRole('button',{name:'北大路・国際会館方面',exact:true}).click();await expect(page.getByRole('button',{name:'北大路・国際会館方面',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'☆ お気に入り',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/学園都市/}).click();await expect(page.locator('.review-station-change')).toContainText('学園都市');
  await page.getByRole('button',{name:'駅・方面',exact:true}).click();await page.getByRole('searchbox').fill('今');await page.getByRole('searchbox').fill('妙法');await expect(page.getByRole('dialog')).toContainText('妙法寺');await page.goBack();await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'この駅・方面を保存'}).dblclick();await expect(page.getByRole('button',{name:'この駅・方面を保存'})).toHaveAttribute('aria-pressed','false');await page.getByRole('button',{name:'この駅・方面を保存'}).click();await expect(page.getByRole('button',{name:'この駅・方面を保存'})).toHaveAttribute('aria-pressed','true');
  await page.reload();await expect(decision).toContainText('徒歩 10分');expect(await page.evaluate(()=>localStorage.getItem('mania-u:v1'))).toBe(original);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test(design+' missing, errors, reference, denied, expiry, end of service, offline and reduced motion',async({page,context})=>{
  await setup(page);await page.goto('/?design='+design);await page.getByText('状態を試す・比較について',{exact:true}).click();
  for(const value of ['unsupported','missing','expired','failed','loading','reference','denied']){
   await page.getByRole('combobox',{name:'表示状態',exact:true}).selectOption(value);
   await expect(page.locator('.review-status')).toBeVisible();await expect(page.locator('.review-leave')).toHaveCount(0);
   if(value!=='denied')await expect(page.locator('.review-status')).not.toContainText('発車は終了');
  }
  await page.getByRole('button',{name:'実測時間を入力',exact:true}).first().click();await page.getByLabel('駅入口までの実測時間（分）').fill('8');await page.getByRole('button',{name:'この条件で見る'}).click();
  await page.getByRole('combobox',{name:'表示状態',exact:true}).selectOption('ended');await expect(page.locator('.review-status')).toContainText('この運行日の発車は終了しました');await expect(page.locator('.review-leave')).toHaveCount(0);
  await page.getByRole('combobox',{name:'表示状態',exact:true}).selectOption('normal');await context.setOffline(true);await expect(page.locator('.review-status')).toContainText('オフラインです');await expect(page.locator('.review-leave')).toBeVisible();await context.setOffline(false);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.review-train-row').first()).toHaveCSS('transition-duration','0s');
  await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'駅・方面',exact:true}).click();await page.getByRole('searchbox').fill('存在しない駅');await expect(page.getByRole('dialog')).toContainText('駅が見つかりません');await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
 });
}
test('baseline capture and isolated settings',async({page},info)=>{await setup(page);await page.goto('/?design=baseline');await expect(page.getByRole('region',{name:'出発判断',exact:true})).toContainText('学園都市');await page.screenshot({path:`docs/screenshots/design-20261026/baseline-${info.project.name}.png`,fullPage:true});expect(await page.evaluate(()=>localStorage.getItem('mania-u:v1'))).toBe(original);});
