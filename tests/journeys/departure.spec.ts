import {test,expect,type Page} from '@playwright/test';
import {chooseStation,mockRuntime} from '../fixtures/runtime';

const baseline=process.env.JOURNEY_BASELINE==='1';
const capture=process.env.JOURNEY_CAPTURE??'local';
async function screenshot(page:Page,project:string,name:string){
 await page.screenshot({path:`docs/screenshots/mobile-20261023/${capture}-${project}-${name}.png`});
}
async function inViewport(page:Page,selector:string){
 const box=(await page.locator(selector).first().boundingBox())!;
 expect(box.y).toBeGreaterThanOrEqual(0);
 expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 expect(box.x).toBeGreaterThanOrEqual(0);
 expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test('unknown location to measured departure, next train and saved-place reuse',async({page},info)=>{
 const time=new Date('2026-10-23T14:00:00+09:00');
 await page.clock.install({time:new Date(time.getTime()-60000)});await page.clock.pauseAt(time);
 if(!process.env.JOURNEY_URL)await mockRuntime(page);
 let walkingRequests=0;
 await page.route('**/api/walking',route=>{walkingRequests++;return route.abort();});
 await page.addInitScript(()=>{
  const deny=(_success:PositionCallback,error?:PositionErrorCallback|null)=>{error?.({code:1,message:'Test denial',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});return 1;};
  navigator.geolocation.watchPosition=deny;
  navigator.geolocation.getCurrentPosition=deny;
  navigator.geolocation.clearWatch=()=>{};
 });
 await page.goto('/');await chooseStation(page,'kyoto-imadegawa');await page.getByRole('button',{name:'北大路・国際会館方面'}).click();
 await page.evaluate(()=>window.scrollTo(0,0));
 await expect(page.locator('.decision-train')).toContainText('14:08 発');
 await expect(page.locator('.stay-countdown')).toHaveText('計算できません');
 await screenshot(page,info.project.name,'unknown');
 await page.getByRole('button',{name:'現在地を更新',exact:true}).click();
 await expect(page.locator('.decision-summary')).toContainText('拒否');
 await expect(page.locator('.stay-countdown')).toHaveText('計算できません');
 await page.getByRole('button',{name:'実測時間を使う',exact:true}).click();
 await screenshot(page,info.project.name,'manual-open');
 if(baseline)await page.locator('.place-form > summary').click();
 else {
  await expect(page.getByLabel('地点名',{exact:true})).toBeFocused();
  await inViewport(page,'.place-form input');
 }
 await page.getByLabel('地点名',{exact:true}).fill('確認用の架空地点');
 await page.getByLabel('到着する駅入口',{exact:true}).fill('確認用入口');
 await page.getByLabel('入口までの実測徒歩時間（分）',{exact:true}).fill('1');
 await page.getByRole('button',{name:'端末に保存して使う',exact:true}).click();
 await expect(page.locator('.stay-countdown')).toContainText('4分');
 await expect(page.locator('.stay-deadline')).toContainText('14:04:00');
 await screenshot(page,info.project.name,'selected');
 if(!baseline)await inViewport(page,'.decision-actions button');
 await page.getByRole('button',{name:'一本後を選ぶ',exact:true}).click();
 await expect(page.locator('.decision-train')).toContainText('14:15 発');
 await expect(page.locator('.stay-countdown')).toContainText('11分');
 await expect(page.locator('.stay-deadline')).toContainText('14:11:00');
 await screenshot(page,info.project.name,'next');
 if(!baseline)for(const selector of ['.decision-station','.decision-train','.stay-countdown','.stay-deadline'])await inViewport(page,selector);
 expect(await page.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.reload();
 await expect(page.locator('.stay-countdown')).toHaveText('計算できません');
 await page.getByRole('button',{name:'実測時間を使う',exact:true}).click();
 await expect(page.getByRole('button',{name:'出発地点',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'出発地点',exact:true}).click();
 await page.getByRole('option',{name:/確認用の架空地点/}).click();
 await expect(page.locator('.stay-countdown')).toContainText('4分');
 if(!baseline){
  await expect(page.getByRole('heading',{name:'出発判断',exact:true})).toBeFocused();
  await inViewport(page,'.stay-deadline');
 }
 expect(walkingRequests).toBe(0);
});
