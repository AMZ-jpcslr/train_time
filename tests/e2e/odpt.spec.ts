import {test,expect} from '@playwright/test';
import {mockRuntime,previewAt,saveMeasuredPlace} from '../fixtures/runtime';
import {stations} from '../../src/data/stations';
const toei=stations.find(s=>s.name==='西馬込')!;
const tram=stations.find(s=>s.name==='鴨部')!;
test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-10-23T14:00:00+09:00')});await mockRuntime(page);});
test('search can favorite without selecting, survives reload, and loads only the selected station',async({page},info)=>{
 const requested:string[]=[];page.on('request',r=>{if(r.url().includes('/data/odpt/'))requested.push(r.url());});
 await page.goto('/');expect(requested).toHaveLength(0);
 const trigger=page.getByRole('button',{name:'乗車駅',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});await dialog.getByLabel('駅名・路線で検索').fill('Nishi-magome');
 await expect(dialog.locator('[data-station-id]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'西馬込（浅草線）をお気に入りに登録',exact:true}).click();
 await expect(trigger).toContainText('学園都市');await expect(dialog).toBeVisible();expect(requested).toHaveLength(0);
 await dialog.getByRole('button',{name:'駅選択を閉じる'}).click();await page.reload();
 await page.getByRole('region',{name:'お気に入りの駅',exact:true}).getByRole('button',{name:/西馬込/}).click();
 await expect(page.locator('.next-train')).toBeVisible();expect(requested).toHaveLength(1);
 await expect(page.locator('.line-info')).toContainText('浅草線');await expect(page.locator('.judgment')).toContainText('判定不可');
 await saveMeasuredPlace(page);await expect(page.locator('.judgment')).not.toContainText('判定不可');
 await page.getByRole('button',{name:/出典・確認日/}).click();await expect(page.locator('.source-detail')).toContainText('GTFS');
 await trigger.click();await dialog.getByLabel('駅名・路線で検索').fill('東京');
 await expect(dialog.locator('[data-station-id]')).toHaveCount(40);await dialog.getByRole('button',{name:/さらに40件/}).click();await expect(dialog.locator('[data-station-id]')).toHaveCount(80);
 await dialog.getByLabel('駅名・路線で検索').fill('西馬込');await dialog.getByRole('button',{name:'西馬込（浅草線）をお気に入りから解除',exact:true}).click();
 await dialog.getByRole('button',{name:'駅選択を閉じる'}).click();await page.reload();await expect(page.getByRole('region',{name:'お気に入りの駅',exact:true})).toHaveCount(0);
 await page.screenshot({path:`docs/screenshots/${info.project.name}-odpt-board.png`,fullPage:true});
});
test('failed station fetch can retry and half-minute departures stay exact on small screens',async({page},info)=>{
 let fail=true;await page.route('**'+tram.timetablePath,async route=>{if(fail)await route.fulfill({status:503,body:'unavailable'});else await route.continue();});
 await page.goto('/');await page.getByRole('button',{name:'乗車駅',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'乗車駅を選ぶ'});await dialog.getByLabel('駅名・路線で検索').fill('鴨部');await dialog.locator(`[data-station-id="${tram.id}"]`).click();
 await expect(page.locator('.odpt-feed-message')).toContainText('読み込めません');await expect(page.locator('.next-train')).toHaveCount(0);
 fail=false;await page.getByRole('button',{name:'時刻表を再読み込み'}).click();await expect(page.locator('.next-train')).toBeVisible();
 await previewAt(page,'2026-10-23T05:50');
 // Verify the source's 30-second departure exists in one of the station directions.
 let found=false;
 for(const d of tram.directions){await page.locator('.direction-tabs button').filter({hasText:d.name}).click();if(await page.locator('.next-train').innerText().then(t=>t.includes('05:52:30')))found=true;}
 expect(found).toBe(true);
 await page.setViewportSize({width:320,height:640});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'乗車駅',exact:true}).click();await dialog.getByLabel('駅名・路線で検索').fill('とさでん');
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:`docs/screenshots/${info.project.name}-odpt-search.png`});
});
