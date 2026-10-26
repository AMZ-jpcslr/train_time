import {test,expect} from '@playwright/test';
import {mockRuntime,chooseStation} from '../fixtures/runtime';

test('adopted B uses actual saved walking conditions, persistent favorites and accessible navigation',async({page},info)=>{
 await page.clock.install({time:new Date('2026-10-26T13:59:00+09:00')});await page.clock.pauseAt(new Date('2026-10-26T14:00:00+09:00')); await mockRuntime(page);await page.goto('/');
 await chooseStation(page,'kobe-gakuentoshi');
 await page.getByRole('button',{name:'実測時間を使う',exact:true}).click();
 await page.getByLabel('地点名',{exact:true}).fill('自宅');await page.getByLabel('到着する駅入口',{exact:true}).fill('北口');await page.getByLabel('入口までの実測徒歩時間（分）',{exact:true}).fill('8');await page.getByRole('button',{name:'端末に保存して使う',exact:true}).click();
 await expect(page.locator('.decision-train')).toContainText('14:14');await expect(page.locator('.stay-deadline time')).toHaveText('14:03');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`docs/screenshots/design-20261026/adopted-${info.project.name}.png`,fullPage:true});await page.screenshot({path:`docs/screenshots/design-20261026/adopted-${info.project.name}-viewport.png`});
 const nav=page.getByRole('navigation',{name:'よく使う操作'});
 await page.locator('.action-conditions').click();await expect(page.locator('#walking-settings')).toBeFocused();await expect(page.getByLabel('入口からホームまで（分）',{exact:true})).toHaveValue('3');
 await page.getByRole('button',{name:'この駅と方面をお気に入り',exact:true}).click();
 await nav.getByRole('button',{name:'駅・方面',exact:true}).click();await page.getByLabel('駅名・路線で検索').fill('今出川');await page.locator('[data-station-id="kyoto-imadegawa"]').click();
 await nav.getByRole('button',{name:'☆ お気に入り',exact:true}).click();await page.getByRole('region',{name:'お気に入りの駅と方面',exact:true}).getByRole('button',{name:/学園都市/}).click();await expect(page.getByRole('heading',{name:'出発判断',exact:true})).toBeFocused();
 await page.reload();await expect(page.getByRole('button',{name:'この駅と方面をお気に入り',exact:true})).toHaveAttribute('aria-pressed','true');
 // Reload deliberately requires choosing the saved place again: the user may have moved.
 await page.getByRole('button',{name:'実測時間を使う',exact:true}).click();
 await page.getByRole('button',{name:'出発地点',exact:true}).click();await page.getByRole('dialog',{name:'出発地点を選ぶ',exact:true}).getByRole('option',{name:/自宅/}).click();await expect(page.locator('.stay-deadline time')).toHaveText('14:03');
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:320,height:800});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.decision-summary').screenshot({path:`docs/screenshots/design-20261026/adopted-${info.project.name}-320.png`});
});
