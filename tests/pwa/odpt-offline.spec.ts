import {test,expect} from '@playwright/test';
import {chooseStation,mockRuntime,actualTime} from '../fixtures/runtime';
import {stations} from '../../src/data/stations';
const selected=stations.find(s=>s.name==='西馬込')!,unread=stations.find(s=>s.name==='鴨部')!;
test('ODPT station data is cached on demand, works offline, rejects unread stations, and expires',async({page,context})=>{
 await page.clock.install({time:new Date('2026-10-23T14:00:00+09:00')});
 const api=await mockRuntime(page);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
 const count=()=>page.evaluate(async()=>{
  const names=await caches.keys();let n=0;
  for(const name of names)for(const r of await(await caches.open(name)).keys())if(new URL(r.url).pathname.startsWith('/data/odpt/'))n++;
  return n;
 });
 expect(await count()).toBe(0);
 await chooseStation(page,selected.id);await expect(page.locator('.chosen-decision')).toBeVisible();await expect.poll(count).toBe(1);
 await page.getByRole('button',{name:'この駅と方面をお気に入り',exact:true}).click();
 api.offline=true;await context.setOffline(true);await page.reload();
 await expect(page.locator('.chosen-decision')).toBeVisible();await expect(page.locator('.line-info')).toContainText('浅草線');
 await expect(page.getByRole('button',{name:'この駅と方面をお気に入り',exact:true})).toHaveAttribute('aria-pressed','true');
 await chooseStation(page,unread.id);await expect(page.locator('.odpt-feed-message')).toContainText('オフライン');await expect(page.locator('.chosen-decision')).toHaveCount(0);
 await chooseStation(page,selected.id);await expect(page.locator('.chosen-decision')).toBeVisible();
 await actualTime(page,'2026-12-01T14:00:00+09:00');await expect(page.locator('.decision-empty').getByRole('heading',{name:'ダイヤ適用期間外 / 要再確認'})).toBeVisible();
 expect(errors).toEqual([]);
});
